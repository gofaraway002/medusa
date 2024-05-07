import { BaseFilterable, OperatorMap } from "../../dal"
import { BaseProductCollection } from "../collection/common"

export type ProductStatus = "draft" | "proposed" | "published" | "rejected"

export interface BaseProduct {
  id?: string
  title?: string
  handle?: string
  subtitle?: string
  description?: string
  is_giftcard?: boolean
  status?: ProductStatus
  thumbnail?: string
  width?: number
  weight?: number
  length?: number
  height?: number
  origin_country?: string
  hs_code?: string
  mid_code?: string
  material?: string
  collection?: BaseProductCollection
  collection_id?: string
  categories?: BaseProductCategory[]
  type?: BaseProductType
  type_id?: string
  tags?: BaseProductTag[]
  variants?: BaseProductVariant[]
  options?: BaseProductOption[]
  images?: BaseProductImage[]
  discountable?: boolean
  external_id?: string
  created_at?: string
  updated_at?: string
  deleted_at?: string
  metadata?: Record<string, unknown>
}

export interface BaseProductVariant {
  id?: string
  title?: string
  sku?: string
  barcode?: string
  ean?: string
  upc?: string
  inventory_quantity?: number
  allow_backorder?: boolean
  manage_inventory?: boolean
  hs_code?: string
  origin_country?: string
  mid_code?: string
  material?: string
  weight?: number
  length?: number
  height?: number
  width?: number
  options?: BaseProductOptionValue[]
  product?: BaseProduct
  product_id?: string
  variant_rank?: number
  created_at?: string
  updated_at?: string
  deleted_at?: string
  metadata?: Record<string, unknown>
}

export interface BaseProductCategory {
  id?: string
  name?: string
  description?: string
  handle?: string
  rank?: number
  parent_category?: BaseProductCategory
  parent_category_id?: string
  category_children?: BaseProductCategory[]
  products?: BaseProduct[]
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
}

export interface BaseProductTag {
  id?: string
  value?: string
  products?: BaseProduct[]
  metadata?: Record<string, unknown>
}

export interface BaseProductType {
  id?: string
  value?: string
  created_at?: string
  updated_at?: string
  deleted_at?: string
  metadata?: Record<string, unknown>
}

export interface BaseProductOption {
  id?: string
  title?: string
  product?: BaseProduct
  product_id?: string
  values?: BaseProductOptionValue[]
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  deleted_at?: string
}

export interface BaseProductImage {
  id?: string
  url?: string
  created_at?: string
  updated_at?: string
  deleted_at?: string
  metadata?: Record<string, unknown>
}

export interface BaseProductOptionValue {
  id?: string
  value?: string
  option?: BaseProductOption
  option_id?: string
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  deleted_at?: string
}

export interface BaseProductFilters extends BaseFilterable<BaseProductFilters> {
  q?: string
  status?: ProductStatus | ProductStatus[]
  title?: string | string[]
  handle?: string | string[]
  id?: string | string[]
  is_giftcard?: boolean
  tags?: {
    value?: string[]
  }
  type_id?: string | string[]
  category_id?: string | string[] | OperatorMap<string>
  categories?: { id: OperatorMap<string> } | { id: OperatorMap<string[]> }
  collection_id?: string | string[] | OperatorMap<string>
  created_at?: OperatorMap<string>
  updated_at?: OperatorMap<string>
  deleted_at?: OperatorMap<string>
}

export interface BaseProductTagFilters
  extends BaseFilterable<BaseProductTagFilters> {
  q?: string
  id?: string | string[]
  value?: string | string[]
}

export interface BaseProductTypeFilters
  extends BaseFilterable<BaseProductTypeFilters> {
  q?: string
  id?: string | string[]
  value?: string
}

export interface BaseProductOptionFilters
  extends BaseFilterable<BaseProductOptionFilters> {
  q?: string
  id?: string | string[]
  title?: string | string[]
  product_id?: string | string[]
}

export interface BaseProductVariantFilters
  extends BaseFilterable<BaseProductVariantFilters> {
  q?: string
  id?: string | string[]
  sku?: string | string[]
  product_id?: string | string[]
  options?: Record<string, string>
}

export interface BaseProductCategoryFilters
  extends BaseFilterable<BaseProductCategoryFilters> {
  q?: string
  id?: string | string[]
  name?: string | string[]
  parent_category_id?: string | string[] | null
  handle?: string | string[]
  is_active?: boolean
  is_internal?: boolean
  include_descendants_tree?: boolean
  include_ancestors_tree?: boolean
}
