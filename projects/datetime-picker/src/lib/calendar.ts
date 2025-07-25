import { ComponentPortal, ComponentType, Portal } from '@angular/cdk/portal';
import {
  AfterContentInit,
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  Optional,
  Output,
  SimpleChange,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
  forwardRef,
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { NgxMatCalendarCellClassFunction, NgxMatCalendarUserEvent } from './calendar-body';
import { NgxMatDateAdapter } from './core/date-adapter';
import { NGX_MAT_DATE_FORMATS, NgxMatDateFormats } from './core/date-formats';
import { NGX_MAT_SINGLE_DATE_SELECTION_MODEL_PROVIDER, NgxDateRange } from './date-selection-model';
import { createMissingDateImplError } from './datepicker-errors';
import { NgxMatDatepickerIntl } from './datepicker-intl';
import { NgxMatMonthView } from './month-view';
import {
  NgxMatMultiYearView,
  getActiveOffset,
  isSameMultiYearView,
  yearsPerPage,
} from './multi-year-view';
import { NgxMatYearView } from './year-view';

let calendarHeaderId = 1;

/**
 * Possible views for the calendar.
 * @docs-private
 */
export type NgxMatCalendarView = 'month' | 'year' | 'multi-year';

/** Default header for MatCalendar */
@Component({
    selector: 'ngx-mat-calendar-header',
    templateUrl: 'calendar-header.html',
    exportAs: 'ngxMatCalendarHeader',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class NgxMatCalendarHeader<D> {
  constructor(
    private _intl: NgxMatDatepickerIntl,
    @Inject(forwardRef(() => NgxMatCalendar)) public calendar: NgxMatCalendar<D>,
    @Optional() private _dateAdapter: NgxMatDateAdapter<D>,
    @Optional() @Inject(NGX_MAT_DATE_FORMATS) private _dateFormats: NgxMatDateFormats,
    changeDetectorRef: ChangeDetectorRef,
  ) {
    this.calendar.stateChanges.subscribe(() => changeDetectorRef.markForCheck());
  }

  /** The display text for the current calendar view. */
  get periodButtonText(): string {
    if (this.calendar.currentView == 'month') {
      return this._dateAdapter
        .format(this.calendar.activeDate, this._dateFormats.display.monthYearLabel)
        .toLocaleUpperCase();
    }
    if (this.calendar.currentView == 'year') {
      return this._dateAdapter.getYearName(this.calendar.activeDate);
    }

    return this._intl.formatYearRange(...this._formatMinAndMaxYearLabels());
  }

  /** The aria description for the current calendar view. */
  get periodButtonDescription(): string {
    if (this.calendar.currentView == 'month') {
      return this._dateAdapter
        .format(this.calendar.activeDate, this._dateFormats.display.monthYearLabel)
        .toLocaleUpperCase();
    }
    if (this.calendar.currentView == 'year') {
      return this._dateAdapter.getYearName(this.calendar.activeDate);
    }

    // Format a label for the window of years displayed in the multi-year calendar view. Use
    // `formatYearRangeLabel` because it is TTS friendly.
    return this._intl.formatYearRangeLabel(...this._formatMinAndMaxYearLabels());
  }

  /** The `aria-label` for changing the calendar view. */
  get periodButtonLabel(): string {
    return this.calendar.currentView == 'month'
      ? this._intl.switchToMultiYearViewLabel
      : this._intl.switchToMonthViewLabel;
  }

  /** The label for the previous button. */
  get prevButtonLabel(): string {
    return {
      'month': this._intl.prevMonthLabel,
      'year': this._intl.prevYearLabel,
      'multi-year': this._intl.prevMultiYearLabel,
    }[this.calendar.currentView];
  }

  /** The label for the next button. */
  get nextButtonLabel(): string {
    return {
      'month': this._intl.nextMonthLabel,
      'year': this._intl.nextYearLabel,
      'multi-year': this._intl.nextMultiYearLabel,
    }[this.calendar.currentView];
  }

  /** Handles user clicks on the period label. */
  currentPeriodClicked(): void {
    this.calendar.currentView = this.calendar.currentView == 'month' ? 'multi-year' : 'month';
  }

  /** Handles user clicks on the previous button. */
  previousClicked(): void {
    this.calendar.activeDate =
      this.calendar.currentView == 'month'
        ? this._dateAdapter.addCalendarMonths(this.calendar.activeDate, -1)
        : this._dateAdapter.addCalendarYears(
          this.calendar.activeDate,
          this.calendar.currentView == 'year' ? -1 : -yearsPerPage,
        );
  }

  /** Handles user clicks on the next button. */
  nextClicked(): void {
    this.calendar.activeDate =
      this.calendar.currentView == 'month'
        ? this._dateAdapter.addCalendarMonths(this.calendar.activeDate, 1)
        : this._dateAdapter.addCalendarYears(
          this.calendar.activeDate,
          this.calendar.currentView == 'year' ? 1 : yearsPerPage,
        );
  }

  /** Whether the previous period button is enabled. */
  previousEnabled(): boolean {
    if (!this.calendar.minDate) {
      return true;
    }
    return (
      !this.calendar.minDate || !this._isSameView(this.calendar.activeDate, this.calendar.minDate)
    );
  }

  /** Whether the next period button is enabled. */
  nextEnabled(): boolean {
    return (
      !this.calendar.maxDate || !this._isSameView(this.calendar.activeDate, this.calendar.maxDate)
    );
  }

  /** Whether the two dates represent the same view in the current view mode (month or year). */
  private _isSameView(date1: D, date2: D): boolean {
    if (this.calendar.currentView == 'month') {
      return (
        this._dateAdapter.getYear(date1) == this._dateAdapter.getYear(date2) &&
        this._dateAdapter.getMonth(date1) == this._dateAdapter.getMonth(date2)
      );
    }
    if (this.calendar.currentView == 'year') {
      return this._dateAdapter.getYear(date1) == this._dateAdapter.getYear(date2);
    }
    // Otherwise we are in 'multi-year' view.
    return isSameMultiYearView(
      this._dateAdapter,
      date1,
      date2,
      this.calendar.minDate,
      this.calendar.maxDate,
    );
  }

  /**
   * Format two individual labels for the minimum year and maximum year available in the multi-year
   * calendar view. Returns an array of two strings where the first string is the formatted label
   * for the minimum year, and the second string is the formatted label for the maximum year.
   */
  private _formatMinAndMaxYearLabels(): [minYearLabel: string, maxYearLabel: string] {
    // The offset from the active year to the "slot" for the starting year is the
    // *actual* first rendered year in the multi-year view, and the last year is
    // just yearsPerPage - 1 away.
    const activeYear = this._dateAdapter.getYear(this.calendar.activeDate);
    const minYearOfPage =
      activeYear -
      getActiveOffset(
        this._dateAdapter,
        this.calendar.activeDate,
        this.calendar.minDate,
        this.calendar.maxDate,
      );
    const maxYearOfPage = minYearOfPage + yearsPerPage - 1;
    const minYearLabel = this._dateAdapter.getYearName(
      this._dateAdapter.createDate(minYearOfPage, 0, 1),
    );
    const maxYearLabel = this._dateAdapter.getYearName(
      this._dateAdapter.createDate(maxYearOfPage, 0, 1),
    );

    return [minYearLabel, maxYearLabel];
  }

  private _id = `mat-calendar-header-${calendarHeaderId++}`;

  _periodButtonLabelId = `${this._id}-period-label`;
}

/** A calendar that is used as part of the datepicker. */
@Component({
    selector: 'ngx-mat-calendar',
    templateUrl: 'calendar.html',
    styleUrls: ['calendar.scss'],
    host: {
        'class': 'mat-calendar',
    },
    exportAs: 'ngxMatCalendar',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [NGX_MAT_SINGLE_DATE_SELECTION_MODEL_PROVIDER],
    standalone: false
})
export class NgxMatCalendar<D> implements AfterContentInit, AfterViewChecked, OnDestroy, OnChanges {
  /** An input indicating the type of the header component, if set. */
  @Input() headerComponent: ComponentType<any>;

  /** A portal containing the header component type for this calendar. */
  _calendarHeaderPortal: Portal<any>;

  private _intlChanges: Subscription;

  /**
   * Used for scheduling that focus should be moved to the active cell on the next tick.
   * We need to schedule it, rather than do it immediately, because we have to wait
   * for Angular to re-evaluate the view children.
   */
  private _moveFocusOnNextTick = false;

  /** A date representing the period (month or year) to start the calendar in. */
  @Input()
  get startAt(): D | null {
    return this._startAt;
  }
  set startAt(value: D | null) {
    this._startAt = this._dateAdapter.getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _startAt: D | null;

  /** Whether the calendar should be started in month or year view. */
  @Input() startView: NgxMatCalendarView = 'month';

  /** The currently selected date. */
  @Input()
  get selected(): NgxDateRange<D> | D | null {
    return this._selected;
  }
  set selected(value: NgxDateRange<D> | D | null) {
    if (value instanceof NgxDateRange) {
      this._selected = value;
    } else {
      this._selected = this._dateAdapter.getValidDateOrNull(this._dateAdapter.deserialize(value));
    }
  }
  private _selected: NgxDateRange<D> | D | null;

  /** The minimum selectable date. */
  @Input()
  get minDate(): D | null {
    return this._minDate;
  }
  set minDate(value: D | null) {
    this._minDate = this._dateAdapter.getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _minDate: D | null;

  /** The maximum selectable date. */
  @Input()
  get maxDate(): D | null {
    return this._maxDate;
  }
  set maxDate(value: D | null) {
    this._maxDate = this._dateAdapter.getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _maxDate: D | null;

  /** Function used to filter which dates are selectable. */
  @Input() dateFilter: (date: D) => boolean;

  /** Function that can be used to add custom CSS classes to dates. */
  @Input() dateClass: NgxMatCalendarCellClassFunction<D>;

  /** Start of the comparison range. */
  @Input() comparisonStart: D | null;

  /** End of the comparison range. */
  @Input() comparisonEnd: D | null;

  /** ARIA Accessible name of the `<input matStartDate/>` */
  @Input() startDateAccessibleName: string | null;

  /** ARIA Accessible name of the `<input matEndDate/>` */
  @Input() endDateAccessibleName: string | null;

  @Input() showWeekNumbers = false;

  /** Emits when the currently selected date changes. */
  @Output() readonly selectedChange: EventEmitter<D | null> = new EventEmitter<D | null>();

  /**
   * Emits the year chosen in multiyear view.
   * This doesn't imply a change on the selected date.
   */
  @Output() readonly yearSelected: EventEmitter<D> = new EventEmitter<D>();

  /**
   * Emits the month chosen in year view.
   * This doesn't imply a change on the selected date.
   */
  @Output() readonly monthSelected: EventEmitter<D> = new EventEmitter<D>();

  /**
   * Emits when the current view changes.
   */
  @Output() readonly viewChanged: EventEmitter<NgxMatCalendarView> = new EventEmitter<NgxMatCalendarView>(
    true,
  );

  /** Emits when any date is selected. */
  @Output() readonly _userSelection: EventEmitter<NgxMatCalendarUserEvent<D | null>> =
    new EventEmitter<NgxMatCalendarUserEvent<D | null>>();

  /** Emits a new date range value when the user completes a drag drop operation. */
  @Output() readonly _userDragDrop = new EventEmitter<NgxMatCalendarUserEvent<NgxDateRange<D>>>();

  /** Reference to the current month view component. */
  @ViewChild(NgxMatMonthView) monthView: NgxMatMonthView<D>;

  /** Reference to the current year view component. */
  @ViewChild(NgxMatYearView) yearView: NgxMatYearView<D>;

  /** Reference to the current multi-year view component. */
  @ViewChild(NgxMatMultiYearView) multiYearView: NgxMatMultiYearView<D>;

  /**
   * The current active date. This determines which time period is shown and which date is
   * highlighted when using keyboard navigation.
   */
  get activeDate(): D {
    return this._clampedActiveDate;
  }
  set activeDate(value: D) {
    this._clampedActiveDate = this._dateAdapter.clampDate(value, this.minDate, this.maxDate);
    this.stateChanges.next();
    this._changeDetectorRef.markForCheck();
  }
  private _clampedActiveDate: D;

  /** Whether the calendar is in month view. */
  get currentView(): NgxMatCalendarView {
    return this._currentView;
  }
  set currentView(value: NgxMatCalendarView) {
    const viewChangedResult = this._currentView !== value ? value : null;
    this._currentView = value;
    this._moveFocusOnNextTick = true;
    this._changeDetectorRef.markForCheck();
    if (viewChangedResult) {
      this.viewChanged.emit(viewChangedResult);
    }
  }
  private _currentView: NgxMatCalendarView;

  /** Origin of active drag, or null when dragging is not active. */
  protected _activeDrag: NgxMatCalendarUserEvent<D> | null = null;

  /**
   * Emits whenever there is a state change that the header may need to respond to.
   */
  readonly stateChanges = new Subject<void>();

  constructor(
    _intl: NgxMatDatepickerIntl,
    @Optional() private _dateAdapter: NgxMatDateAdapter<D>,
    @Optional() @Inject(NGX_MAT_DATE_FORMATS) private _dateFormats: NgxMatDateFormats,
    private _changeDetectorRef: ChangeDetectorRef,
  ) {
    if (!this._dateAdapter) {
      throw createMissingDateImplError('NgxMatDateAdapter');
    }

    if (!this._dateFormats) {
      throw createMissingDateImplError('NGX_MAT_DATE_FORMATS');
    }


    this._intlChanges = _intl.changes.subscribe(() => {
      _changeDetectorRef.markForCheck();
      this.stateChanges.next();
    });
  }

  ngAfterContentInit() {
    this._calendarHeaderPortal = new ComponentPortal(this.headerComponent || NgxMatCalendarHeader);
    this.activeDate = this.startAt || this._dateAdapter.today();

    // Assign to the private property since we don't want to move focus on init.
    this._currentView = this.startView;
  }

  ngAfterViewChecked() {
    if (this._moveFocusOnNextTick) {
      this._moveFocusOnNextTick = false;
      this.focusActiveCell();
    }
  }

  ngOnDestroy() {
    this._intlChanges.unsubscribe();
    this.stateChanges.complete();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Ignore date changes that are at a different time on the same day. This fixes issues where
    // the calendar re-renders when there is no meaningful change to [minDate] or [maxDate]
    // (#24435).
    const minDateChange: SimpleChange | undefined =
      changes['minDate'] &&
        !this._dateAdapter.sameDate(changes['minDate'].previousValue, changes['minDate'].currentValue)
        ? changes['minDate']
        : undefined;
    const maxDateChange: SimpleChange | undefined =
      changes['maxDate'] &&
        !this._dateAdapter.sameDate(changes['maxDate'].previousValue, changes['maxDate'].currentValue)
        ? changes['maxDate']
        : undefined;

    const change = minDateChange || maxDateChange || changes['dateFilter'];

    if (change && !change.firstChange) {
      const view = this._getCurrentViewComponent();

      if (view) {
        // We need to `detectChanges` manually here, because the `minDate`, `maxDate` etc. are
        // passed down to the view via data bindings which won't be up-to-date when we call `_init`.
        this._changeDetectorRef.detectChanges();
        view._init();
      }
    }

    this.stateChanges.next();
  }

  /** Focuses the active date. */
  focusActiveCell() {
    this._getCurrentViewComponent()._focusActiveCell(false);
  }

  /** Updates today's date after an update of the active date */
  updateTodaysDate() {
    this._getCurrentViewComponent()._init();
  }

  /** Handles date selection in the month view. */
  _dateSelected(event: NgxMatCalendarUserEvent<D | null>): void {

    if (event.value && this.selected) {
      this._dateAdapter.copyTime(event.value as D, this.selected as D);
    }

    const date = event.value;

    if (
      this.selected instanceof NgxDateRange ||
      (date && !this._dateAdapter.sameDate(date, this.selected))
    ) {
      this.selectedChange.emit(date);
    }

    this._userSelection.emit(event);
  }

  /** Handles year selection in the multiyear view. */
  _yearSelectedInMultiYearView(normalizedYear: D) {
    this.yearSelected.emit(normalizedYear);
  }

  /** Handles month selection in the year view. */
  _monthSelectedInYearView(normalizedMonth: D) {
    this.monthSelected.emit(normalizedMonth);
  }

  /** Handles year/month selection in the multi-year/year views. */
  _goToDateInView(date: D, view: 'month' | 'year' | 'multi-year'): void {
    this.activeDate = date;
    this.currentView = view;
  }

  /** Called when the user starts dragging to change a date range. */
  _dragStarted(event: NgxMatCalendarUserEvent<D>) {
    this._activeDrag = event;
  }

  /**
   * Called when a drag completes. It may end in cancelation or in the selection
   * of a new range.
   */
  _dragEnded(event: NgxMatCalendarUserEvent<NgxDateRange<D> | null>) {
    if (!this._activeDrag) return;

    if (event.value) {
      this._userDragDrop.emit(event as NgxMatCalendarUserEvent<NgxDateRange<D>>);
    }

    this._activeDrag = null;
  }

  /** Returns the component instance that corresponds to the current calendar view. */
  private _getCurrentViewComponent(): NgxMatMonthView<D> | NgxMatYearView<D> | NgxMatMultiYearView<D> {
    // The return type is explicitly written as a union to ensure that the Closure compiler does
    // not optimize calls to _init(). Without the explicit return type, TypeScript narrows it to
    // only the first component type. See https://github.com/angular/components/issues/22996.
    return this.monthView || this.yearView || this.multiYearView;
  }
}
