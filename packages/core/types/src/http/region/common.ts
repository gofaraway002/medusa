import { BaseFilterable, OperatorMap } from "../../dal"

export interface BaseRegion {
  id?: string
  name?: string
  currency_code?: string
  automatic_taxes?: boolean
  countries?: BaseRegionCountry[]
  metadata?: Record<string, any>
  created_at?: string
  updated_at?: string
}

export interface BaseRegionCountry {
  id?: string
  iso_2?: string
  iso_3?: string
  num_code?: number
  name?: string
  display_name?: string
}

export interface BaseRegionFilters extends BaseFilterable<BaseRegionFilters> {
  q?: string
  id?: string[] | string | OperatorMap<string | string[]>
  name?: string | OperatorMap<string>
  currency_code?: string | OperatorMap<string>
  metadata?: Record<string, unknown> | OperatorMap<Record<string, unknown>>
  created_at?: OperatorMap<string>
  updated_at?: OperatorMap<string>
}

export interface BaseRegionCountryFilters
  extends BaseFilterable<BaseRegionCountryFilters> {
  id?: string[] | string
  iso_2?: string[] | string
  iso_3?: string[] | string
  num_code?: number[] | string
  name?: string[] | string
  display_name?: string[] | string
}
