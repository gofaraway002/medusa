import { BaseFilterable, OperatorMap } from "../../dal"
import { BaseProduct } from "../product/common"

export interface BaseProductCollection {
  id?: string
  title?: string
  handle?: string
  created_at?: string
  updated_at?: string
  deleted_at?: string
  products?: BaseProduct[]
  metadata?: Record<string, unknown>
}

export interface BaseProductCollectionFilters
  extends BaseFilterable<BaseProductCollectionFilters> {
  q?: string
  id?: string | string[]
  handle?: string | string[]
  title?: string | string[]
}
