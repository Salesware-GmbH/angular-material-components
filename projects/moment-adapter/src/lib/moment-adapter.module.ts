

import { NgxMatDateAdapter, NGX_MAT_DATE_FORMATS, NgxMatDateFormats } from '@salesware/angular-material-components-datetime-picker';
import { NgModule, Provider } from '@angular/core';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { NgxMatMomentAdapter, NGX_MAT_MOMENT_DATE_ADAPTER_OPTIONS, NgxMatMomentDateAdapterOptions } from './moment-adapter';
import { NGX_MAT_MOMENT_FORMATS } from './moment-formats';

@NgModule({
  providers: [
    {
      provide: NgxMatDateAdapter,
      useClass: NgxMatMomentAdapter,
      deps: [MAT_DATE_LOCALE, NGX_MAT_MOMENT_DATE_ADAPTER_OPTIONS]
    }
  ],
})
export class NgxMomentDateModule { }


@NgModule({
  imports: [NgxMomentDateModule],
  providers: [{ provide: NGX_MAT_DATE_FORMATS, useValue: NGX_MAT_MOMENT_FORMATS }],
})
export class NgxMatMomentModule { }

export function provideNgxMatMomentDateAdapter(
  formats: NgxMatDateFormats = NGX_MAT_MOMENT_FORMATS,
  options?: NgxMatMomentDateAdapterOptions
): Provider[] {
  const providers: Provider[] = [
    {
      provide: NgxMatDateAdapter,
      useClass: NgxMatMomentAdapter,
      deps: [MAT_DATE_LOCALE, NGX_MAT_MOMENT_DATE_ADAPTER_OPTIONS]
    },
    { provide: NGX_MAT_DATE_FORMATS, useValue: formats }
  ];

  if (options) {
    providers.push({ provide: NGX_MAT_MOMENT_DATE_ADAPTER_OPTIONS, useValue: options });
  }

  return providers;
}
