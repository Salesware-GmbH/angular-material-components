import {Platform} from '@angular/cdk/platform';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
  NgZone,
  OnChanges,
  SimpleChanges,
  OnDestroy,
  AfterViewChecked,
  inject,
} from '@angular/core';
import {take} from 'rxjs/operators';

/** Extra CSS classes that can be associated with a calendar cell. */
export type NgxMatCalendarCellCssClasses = string | string[] | Set<string> | {[key: string]: any};

/** Function that can generate the extra classes that should be added to a calendar cell. */
export type NgxMatCalendarCellClassFunction<D> = (
  date: D,
  view: 'month' | 'year' | 'multi-year',
) => NgxMatCalendarCellCssClasses;

/**
 * An internal class that represents the data corresponding to a single calendar cell.
 * @docs-private
 */
export class NgxMatCalendarCell<D = any> {
  constructor(
    public value: number,
    public displayValue: string,
    public ariaLabel: string,
    public enabled: boolean,
    public cssClasses: NgxMatCalendarCellCssClasses = {},
    public compareValue = value,
    public rawValue?: D,
    public isWeekNumber?: boolean,
  ) {}
}

/** Event emitted when a date inside the calendar is triggered as a result of a user action. */
export interface NgxMatCalendarUserEvent<D> {
  value: D;
  event: Event;
}

let calendarBodyId = 1;

@Component({
    selector: '[ngx-mat-calendar-body]',
    templateUrl: 'calendar-body.html',
    styleUrls: ['calendar-body.scss'],
    host: {
        'class': 'ngx-mat-calendar-body',
    },
    exportAs: 'matCalendarBody',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class NgxMatCalendarBody<D = any> implements OnChanges, OnDestroy, AfterViewChecked {
  private _platform = inject(Platform);

  /**
   * Used to skip the next focus event when rendering the preview range.
   * We need a flag like this, because some browsers fire focus events asynchronously.
   */
  private _skipNextFocus: boolean;

  /**
   * Used to focus the active cell after change detection has run.
   */
  private _focusActiveCellAfterViewChecked = false;

  /** The label for the table. (e.g. "Jan 2017"). */
  @Input() label: string;

  /** The cells to display in the table. */
  @Input() rows: NgxMatCalendarCell[][];

  /** The value in the table that corresponds to today. */
  @Input() todayValue: number;

  /** Start value of the selected date range. */
  @Input() startValue: number;

  /** End value of the selected date range. */
  @Input() endValue: number;

  /** The minimum number of free cells needed to fit the label in the first row. */
  @Input() labelMinRequiredCells: number;

  /** The number of columns in the table. */
  @Input() numCols: number = 7;

  /** The cell number of the active cell in the table. */
  @Input() activeCell: number = 0;

  @Input() hideLabel = false;

  ngAfterViewChecked() {
    if (this._focusActiveCellAfterViewChecked) {
      this._focusActiveCell();
      this._focusActiveCellAfterViewChecked = false;
    }
  }

  /** Whether a range is being selected. */
  @Input() isRange: boolean = false;

  /**
   * The aspect ratio (width / height) to use for the cells in the table. This aspect ratio will be
   * maintained even as the table resizes.
   */
  @Input() cellAspectRatio: number = 1;

  /** Start of the comparison range. */
  @Input() comparisonStart: number | null;

  /** End of the comparison range. */
  @Input() comparisonEnd: number | null;

  /** Start of the preview range. */
  @Input() previewStart: number | null = null;

  /** End of the preview range. */
  @Input() previewEnd: number | null = null;

  /** ARIA Accessible name of the `<input matStartDate/>` */
  @Input() startDateAccessibleName: string | null;

  /** ARIA Accessible name of the `<input matEndDate/>` */
  @Input() endDateAccessibleName: string | null;

  /** Emits when a new value is selected. */
  @Output() readonly selectedValueChange = new EventEmitter<NgxMatCalendarUserEvent<number>>();

  /** Emits when the preview has changed as a result of a user action. */
  @Output() readonly previewChange = new EventEmitter<
    NgxMatCalendarUserEvent<NgxMatCalendarCell | null>
  >();

  @Output() readonly activeDateChange = new EventEmitter<NgxMatCalendarUserEvent<number>>();

  /** Emits the date at the possible start of a drag event. */
  @Output() readonly dragStarted = new EventEmitter<NgxMatCalendarUserEvent<D>>();

  /** Emits the date at the conclusion of a drag, or null if mouse was not released on a date. */
  @Output() readonly dragEnded = new EventEmitter<NgxMatCalendarUserEvent<D | null>>();

  /** The number of blank cells to put at the beginning for the first row. */
  _firstRowOffset: number;

  /** Padding for the individual date cells. */
  _cellPadding: string;

  /** Width of an individual cell. */
  _cellWidth: string;

  private _didDragSinceMouseDown = false;

  constructor(private _elementRef: ElementRef<HTMLElement>, private _ngZone: NgZone) {
    _ngZone.runOutsideAngular(() => {
      const element = _elementRef.nativeElement;
      element.addEventListener('mouseenter', this._enterHandler, true);
      element.addEventListener('touchmove', this._touchmoveHandler, true);
      element.addEventListener('focus', this._enterHandler, true);
      element.addEventListener('mouseleave', this._leaveHandler, true);
      element.addEventListener('blur', this._leaveHandler, true);
      element.addEventListener('mousedown', this._mousedownHandler);
      element.addEventListener('touchstart', this._mousedownHandler);

      if (this._platform.isBrowser) {
        window.addEventListener('mouseup', this._mouseupHandler);
        window.addEventListener('touchend', this._touchendHandler);
      }
    });
  }

  /** Called when a cell is clicked. */
  _cellClicked(cell: NgxMatCalendarCell, event: MouseEvent): void {
    // Ignore "clicks" that are actually canceled drags (eg the user dragged
    // off and then went back to this cell to undo).
    if (this._didDragSinceMouseDown) {
      return;
    }

    if (cell.enabled) {
      this.selectedValueChange.emit({value: cell.value, event});
    }
  }

  _emitActiveDateChange(cell: NgxMatCalendarCell, event: FocusEvent): void {
    if (cell.enabled) {
      this.activeDateChange.emit({value: cell.value, event});
    }
  }

  /** Returns whether a cell should be marked as selected. */
  _isSelected(value: number) {
    return this.startValue === value || this.endValue === value;
  }

  ngOnChanges(changes: SimpleChanges) {
    const columnChanges = changes['numCols'];
    const {rows, numCols} = this;

    if (changes['rows'] || columnChanges) {
      this._firstRowOffset = rows && rows.length && rows[0].length ? numCols - rows[0].length : 0;
    }

    if (changes['cellAspectRatio'] || columnChanges || !this._cellPadding) {
      this._cellPadding = `${(50 * this.cellAspectRatio) / numCols}%`;
    }

    if (columnChanges || !this._cellWidth) {
      this._cellWidth = `${100 / numCols}%`;
    }
  }

  ngOnDestroy() {
    const element = this._elementRef.nativeElement;
    element.removeEventListener('mouseenter', this._enterHandler, true);
    element.removeEventListener('touchmove', this._touchmoveHandler, true);
    element.removeEventListener('focus', this._enterHandler, true);
    element.removeEventListener('mouseleave', this._leaveHandler, true);
    element.removeEventListener('blur', this._leaveHandler, true);
    element.removeEventListener('mousedown', this._mousedownHandler);
    element.removeEventListener('touchstart', this._mousedownHandler);

    if (this._platform.isBrowser) {
      window.removeEventListener('mouseup', this._mouseupHandler);
      window.removeEventListener('touchend', this._touchendHandler);
    }
  }

  /** Returns whether a cell is active. */
  _isActiveCell(rowIndex: number, colIndex: number): boolean {
    let cellNumber = rowIndex * this.numCols + colIndex;

    // Account for the fact that the first row may not have as many cells.
    if (rowIndex) {
      cellNumber -= this._firstRowOffset;
    }

    return cellNumber == this.activeCell;
  }

  _focusActiveCell(movePreview = true) {
    this._ngZone.runOutsideAngular(() => {
      this._ngZone.onStable.pipe(take(1)).subscribe(() => {
        setTimeout(() => {
          const activeCell: HTMLElement | null = this._elementRef.nativeElement.querySelector(
            '.mat-calendar-body-active',
          );

          if (activeCell) {
            if (!movePreview) {
              this._skipNextFocus = true;
            }

            activeCell.focus();
          }
        });
      });
    });
  }

  /** Focuses the active cell after change detection has run and the microtask queue is empty. */
  _scheduleFocusActiveCellAfterViewChecked() {
    this._focusActiveCellAfterViewChecked = true;
  }

  /** Gets whether a value is the start of the main range. */
  _isRangeStart(value: number) {
    return isStart(value, this.startValue, this.endValue);
  }

  /** Gets whether a value is the end of the main range. */
  _isRangeEnd(value: number) {
    return isEnd(value, this.startValue, this.endValue);
  }

  /** Gets whether a value is within the currently-selected range. */
  _isInRange(value: number): boolean {
    return isInRange(value, this.startValue, this.endValue, this.isRange);
  }

  /** Gets whether a value is the start of the comparison range. */
  _isComparisonStart(value: number) {
    return isStart(value, this.comparisonStart, this.comparisonEnd);
  }

  /** Whether the cell is a start bridge cell between the main and comparison ranges. */
  _isComparisonBridgeStart(value: number, rowIndex: number, colIndex: number) {
    if (!this._isComparisonStart(value) || this._isRangeStart(value) || !this._isInRange(value)) {
      return false;
    }

    let previousCell: NgxMatCalendarCell | undefined = this.rows[rowIndex][colIndex - 1];

    if (!previousCell) {
      const previousRow = this.rows[rowIndex - 1];
      previousCell = previousRow && previousRow[previousRow.length - 1];
    }

    return previousCell && !this._isRangeEnd(previousCell.compareValue);
  }

  /** Whether the cell is an end bridge cell between the main and comparison ranges. */
  _isComparisonBridgeEnd(value: number, rowIndex: number, colIndex: number) {
    if (!this._isComparisonEnd(value) || this._isRangeEnd(value) || !this._isInRange(value)) {
      return false;
    }

    let nextCell: NgxMatCalendarCell | undefined = this.rows[rowIndex][colIndex + 1];

    if (!nextCell) {
      const nextRow = this.rows[rowIndex + 1];
      nextCell = nextRow && nextRow[0];
    }

    return nextCell && !this._isRangeStart(nextCell.compareValue);
  }

  /** Gets whether a value is the end of the comparison range. */
  _isComparisonEnd(value: number) {
    return isEnd(value, this.comparisonStart, this.comparisonEnd);
  }

  /** Gets whether a value is within the current comparison range. */
  _isInComparisonRange(value: number) {
    return isInRange(value, this.comparisonStart, this.comparisonEnd, this.isRange);
  }

  _isComparisonIdentical(value: number) {
    // Note that we don't need to null check the start/end
    // here, because the `value` will always be defined.
    return this.comparisonStart === this.comparisonEnd && value === this.comparisonStart;
  }

  /** Gets whether a value is the start of the preview range. */
  _isPreviewStart(value: number) {
    return isStart(value, this.previewStart, this.previewEnd);
  }

  /** Gets whether a value is the end of the preview range. */
  _isPreviewEnd(value: number) {
    return isEnd(value, this.previewStart, this.previewEnd);
  }

  /** Gets whether a value is inside the preview range. */
  _isInPreview(value: number) {
    return isInRange(value, this.previewStart, this.previewEnd, this.isRange);
  }

  /** Gets ids of aria descriptions for the start and end of a date range. */
  _getDescribedby(value: number): string | null {
    if (!this.isRange) {
      return null;
    }

    if (this.startValue === value && this.endValue === value) {
      return `${this._startDateLabelId} ${this._endDateLabelId}`;
    } else if (this.startValue === value) {
      return this._startDateLabelId;
    } else if (this.endValue === value) {
      return this._endDateLabelId;
    }
    return null;
  }

  /**
   * Event handler for when the user enters an element
   * inside the calendar body (e.g. by hovering in or focus).
   */
  private _enterHandler = (event: Event) => {
    if (this._skipNextFocus && event.type === 'focus') {
      this._skipNextFocus = false;
      return;
    }

    // We only need to hit the zone when we're selecting a range.
    if (event.target && this.isRange) {
      const cell = this._getCellFromElement(event.target as HTMLElement);

      if (cell) {
        this._ngZone.run(() => this.previewChange.emit({value: cell.enabled ? cell : null, event}));
      }
    }
  };

  private _touchmoveHandler = (event: TouchEvent) => {
    if (!this.isRange) return;

    const target = getActualTouchTarget(event);
    const cell = target ? this._getCellFromElement(target as HTMLElement) : null;

    if (target !== event.target) {
      this._didDragSinceMouseDown = true;
    }

    // If the initial target of the touch is a date cell, prevent default so
    // that the move is not handled as a scroll.
    if (getCellElement(event.target as HTMLElement)) {
      event.preventDefault();
    }

    this._ngZone.run(() => this.previewChange.emit({value: cell?.enabled ? cell : null, event}));
  };

  /**
   * Event handler for when the user's pointer leaves an element
   * inside the calendar body (e.g. by hovering out or blurring).
   */
  private _leaveHandler = (event: Event) => {
    // We only need to hit the zone when we're selecting a range.
    if (this.previewEnd !== null && this.isRange) {
      if (event.type !== 'blur') {
        this._didDragSinceMouseDown = true;
      }

      // Only reset the preview end value when leaving cells. This looks better, because
      // we have a gap between the cells and the rows and we don't want to remove the
      // range just for it to show up again when the user moves a few pixels to the side.
      if (
        event.target &&
        this._getCellFromElement(event.target as HTMLElement) &&
        !(
          (event as MouseEvent).relatedTarget &&
          this._getCellFromElement((event as MouseEvent).relatedTarget as HTMLElement)
        )
      ) {
        this._ngZone.run(() => this.previewChange.emit({value: null, event}));
      }
    }
  };

  /**
   * Triggered on mousedown or touchstart on a date cell.
   * Respsonsible for starting a drag sequence.
   */
  private _mousedownHandler = (event: Event) => {
    if (!this.isRange) return;

    this._didDragSinceMouseDown = false;
    // Begin a drag if a cell within the current range was targeted.
    const cell = event.target && this._getCellFromElement(event.target as HTMLElement);
    if (!cell || !this._isInRange(cell.rawValue)) {
      return;
    }

    this._ngZone.run(() => {
      this.dragStarted.emit({
        value: cell.rawValue,
        event,
      });
    });
  };

  /** Triggered on mouseup anywhere. Respsonsible for ending a drag sequence. */
  private _mouseupHandler = (event: Event) => {
    if (!this.isRange) return;

    const cellElement = getCellElement(event.target as HTMLElement);
    if (!cellElement) {
      // Mouseup happened outside of datepicker. Cancel drag.
      this._ngZone.run(() => {
        this.dragEnded.emit({value: null, event});
      });
      return;
    }

    if (cellElement.closest('.mat-calendar-body') !== this._elementRef.nativeElement) {
      // Mouseup happened inside a different month instance.
      // Allow it to handle the event.
      return;
    }

    this._ngZone.run(() => {
      const cell = this._getCellFromElement(cellElement);
      this.dragEnded.emit({value: cell?.rawValue ?? null, event});
    });
  };

  /** Triggered on touchend anywhere. Respsonsible for ending a drag sequence. */
  private _touchendHandler = (event: TouchEvent) => {
    const target = getActualTouchTarget(event);

    if (target) {
      this._mouseupHandler({target} as unknown as Event);
    }
  };

  /** Finds the MatCalendarCell that corresponds to a DOM node. */
  private _getCellFromElement(element: HTMLElement): NgxMatCalendarCell | null {
    const cell = getCellElement(element);

    if (cell) {
      const row = cell.getAttribute('data-mat-row');
      const col = cell.getAttribute('data-mat-col');

      if (row && col) {
        return this.rows[parseInt(row)][parseInt(col)];
      }
    }

    return null;
  }

  private _id = `mat-calendar-body-${calendarBodyId++}`;

  _startDateLabelId = `${this._id}-start-date`;

  _endDateLabelId = `${this._id}-end-date`;
}

/** Checks whether a node is a table cell element. */
function isTableCell(node: Node | undefined | null): node is HTMLTableCellElement {
  return node?.nodeName === 'TD';
}

/**
 * Gets the date table cell element that is or contains the specified element.
 * Or returns null if element is not part of a date cell.
 */
function getCellElement(element: HTMLElement): HTMLElement | null {
  let cell: HTMLElement | undefined;
  if (isTableCell(element)) {
    cell = element;
  } else if (isTableCell(element.parentNode)) {
    cell = element.parentNode as HTMLElement;
  } else if (isTableCell(element.parentNode?.parentNode)) {
    cell = element.parentNode!.parentNode as HTMLElement;
  }

  return cell?.getAttribute('data-mat-row') != null ? cell : null;
}

/** Checks whether a value is the start of a range. */
function isStart(value: number, start: number | null, end: number | null): boolean {
  return end !== null && start !== end && value < end && value === start;
}

/** Checks whether a value is the end of a range. */
function isEnd(value: number, start: number | null, end: number | null): boolean {
  return start !== null && start !== end && value >= start && value === end;
}

/** Checks whether a value is inside of a range. */
function isInRange(
  value: number,
  start: number | null,
  end: number | null,
  rangeEnabled: boolean,
): boolean {
  return (
    rangeEnabled &&
    start !== null &&
    end !== null &&
    start !== end &&
    value >= start &&
    value <= end
  );
}

/**
 * Extracts the element that actually corresponds to a touch event's location
 * (rather than the element that initiated the sequence of touch events).
 */
function getActualTouchTarget(event: TouchEvent): Element | null {
  const touchLocation = event.changedTouches[0];
  return document.elementFromPoint(touchLocation.clientX, touchLocation.clientY);
}
