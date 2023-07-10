import { isDefined, MedusaError } from "medusa-core-utils"
import { DeepPartial, EntityManager } from "typeorm"
import { TransactionBaseService } from "../interfaces"
import {
  FulfillmentStatus,
  LineItem,
  Order,
  PaymentStatus,
  Return,
  ReturnItem,
  ReturnStatus,
} from "../models"
import { ReturnRepository } from "../repositories/return"
import { ReturnItemRepository } from "../repositories/return-item"
import { FindConfig, Selector } from "../types/common"
import { OrdersReturnItem } from "../types/orders"
import { CreateReturnInput, UpdateReturnInput } from "../types/return"
import { buildQuery, setMetadata } from "../utils"

import {
  FulfillmentProviderService,
  LineItemService,
  OrderService,
  ProductVariantInventoryService,
  ReturnReasonService,
  ShippingOptionService,
  TaxProviderService,
  TotalsService,
} from "."

type InjectedDependencies = {
  manager: EntityManager
  totalsService: TotalsService
  lineItemService: LineItemService
  returnRepository: typeof ReturnRepository
  returnItemRepository: typeof ReturnItemRepository
  shippingOptionService: ShippingOptionService
  returnReasonService: ReturnReasonService
  taxProviderService: TaxProviderService
  fulfillmentProviderService: FulfillmentProviderService
  orderService: OrderService
  productVariantInventoryService: ProductVariantInventoryService
}

type Transformer = (
  item?: LineItem,
  quantity?: number,
  additional?: OrdersReturnItem
) => Promise<DeepPartial<LineItem>> | DeepPartial<LineItem>

class ReturnService extends TransactionBaseService {
  protected readonly totalsService_: TotalsService
  protected readonly returnRepository_: typeof ReturnRepository
  protected readonly returnItemRepository_: typeof ReturnItemRepository
  protected readonly lineItemService_: LineItemService
  protected readonly taxProviderService_: TaxProviderService
  protected readonly shippingOptionService_: ShippingOptionService
  protected readonly fulfillmentProviderService_: FulfillmentProviderService
  protected readonly returnReasonService_: ReturnReasonService
  protected readonly orderService_: OrderService
  // eslint-disable-next-line
  protected readonly productVariantInventoryService_: ProductVariantInventoryService

  constructor({
    totalsService,
    lineItemService,
    returnRepository,
    returnItemRepository,
    shippingOptionService,
    returnReasonService,
    taxProviderService,
    fulfillmentProviderService,
    orderService,
    productVariantInventoryService,
  }: InjectedDependencies) {
    // eslint-disable-next-line prefer-rest-params
    super(arguments[0])

    this.totalsService_ = totalsService
    this.returnRepository_ = returnRepository
    this.returnItemRepository_ = returnItemRepository
    this.lineItemService_ = lineItemService
    this.taxProviderService_ = taxProviderService
    this.shippingOptionService_ = shippingOptionService
    this.fulfillmentProviderService_ = fulfillmentProviderService
    this.returnReasonService_ = returnReasonService
    this.orderService_ = orderService
    this.productVariantInventoryService_ = productVariantInventoryService
  }

  /**
   * Retrieves the order line items, given an array of items
   * @param order - the order to get line items from
   * @param items - the items to get
   * @param transformer - a function to apply to each of the items
   *    retrieved from the order, should return a line item. If the transformer
   *    returns an undefined value the line item will be filtered from the
   *    returned array.
   * @return the line items generated by the transformer.
   */
  protected async getFulfillmentItems(
    order: Order,
    items: OrdersReturnItem[],
    transformer: Transformer
  ): Promise<
    (LineItem & {
      reason_id?: string
      note?: string
    })[]
  > {
    let merged = [...order.items]

    // merge items from order with items from order swaps
    if (order.swaps && order.swaps.length) {
      for (const s of order.swaps) {
        merged = [...merged, ...s.additional_items]
      }
    }

    if (order.claims && order.claims.length) {
      for (const c of order.claims) {
        merged = [...merged, ...c.additional_items]
      }
    }

    const toReturn = await Promise.all(
      items.map(async (data) => {
        const item = merged.find((i) => i.id === data.item_id)
        return transformer(item, data.quantity, data)
      })
    )

    return toReturn.filter((i) => !!i) as (LineItem & OrdersReturnItem)[]
  }

  /**
   * @param selector - the query object for find
   * @param config - the config object for find
   * @return the result of the find operation
   */
  async list(
    selector: Selector<Return>,
    config: FindConfig<Return> = {
      skip: 0,
      take: 50,
      order: { created_at: "DESC" },
    }
  ): Promise<Return[]> {
    const returnRepo = this.activeManager_.withRepository(
      this.returnRepository_
    )
    const query = buildQuery(selector, config)
    return returnRepo.find(query)
  }

  /**
   * Cancels a return if possible. Returns can be canceled if it has not been received.
   * @param returnId - the id of the return to cancel.
   * @return the updated Return
   */
  async cancel(returnId: string): Promise<Return | never> {
    return await this.atomicPhase_(async (manager) => {
      const ret = await this.retrieve(returnId)

      if (ret.status === ReturnStatus.RECEIVED) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Can't cancel a return which has been returned"
        )
      }

      const retRepo = manager.withRepository(this.returnRepository_)

      ret.status = ReturnStatus.CANCELED

      return await retRepo.save(ret)
    })
  }

  /**
   * Checks that an order has the statuses necessary to complete a return.
   * fulfillment_status cannot be not_fulfilled or returned.
   * payment_status must be captured.
   * @param order - the order to check statuses on
   * @throws when statuses are not sufficient for returns.
   */
  protected validateReturnStatuses(order: Order): void | never {
    if (
      order.fulfillment_status === FulfillmentStatus.NOT_FULFILLED ||
      order.fulfillment_status === FulfillmentStatus.RETURNED
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Can't return an unfulfilled or already returned order"
      )
    }

    if (order.payment_status !== PaymentStatus.CAPTURED) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Can't return an order with payment unprocessed"
      )
    }
  }

  /**
   * Checks that a given quantity of a line item can be returned. Fails if the
   * item is undefined or if the returnable quantity of the item is lower, than
   * the quantity that is requested to be returned.
   * @param item - the line item to check has sufficient returnable
   *   quantity.
   * @param quantity - the quantity that is requested to be returned.
   * @param additional - the quantity that is requested to be returned.
   * @return a line item where the quantity is set to the requested
   *   return quantity.
   */
  protected validateReturnLineItem(
    item?: LineItem,
    quantity = 0,
    additional: { reason_id?: string; note?: string } = {}
  ): DeepPartial<LineItem> {
    if (!item) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Return contains invalid line item"
      )
    }

    const returnable = item.quantity - item.returned_quantity!
    if (quantity > returnable) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Cannot return more items than have been purchased"
      )
    }

    const toReturn: DeepPartial<ReturnItem> = {
      ...item,
      quantity,
    }

    if ("reason_id" in additional) {
      toReturn.reason_id = additional.reason_id as string
    }

    if ("note" in additional) {
      toReturn.note = additional.note
    }

    return toReturn
  }

  /**
   * Retrieves a return by its id.
   * @param returnId - the id of the return to retrieve
   * @param config - the config object
   * @return the return
   */
  async retrieve(
    returnId: string,
    config: FindConfig<Return> = {}
  ): Promise<Return | never> {
    if (!isDefined(returnId)) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `"returnId" must be defined`
      )
    }

    const returnRepository = this.activeManager_.withRepository(
      this.returnRepository_
    )

    const query = buildQuery({ id: returnId }, config)

    const returnObj = await returnRepository.findOne(query)

    if (!returnObj) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Return with id: ${returnId} was not found`
      )
    }
    return returnObj
  }

  async retrieveBySwap(
    swapId: string,
    relations: string[] = []
  ): Promise<Return | never> {
    const returnRepository = this.activeManager_.withRepository(
      this.returnRepository_
    )

    const returnObj = await returnRepository.findOne({
      where: {
        swap_id: swapId,
      },
      relations,
    })

    if (!returnObj) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Return with swa_id: ${swapId} was not found`
      )
    }

    return returnObj
  }

  async update(returnId: string, update: UpdateReturnInput): Promise<Return> {
    return await this.atomicPhase_(async (manager) => {
      const ret = await this.retrieve(returnId)

      if (ret.status === "canceled") {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Cannot update a canceled return"
        )
      }

      const { metadata, ...rest } = update

      if (metadata) {
        ret.metadata = setMetadata(ret, metadata)
      }

      for (const [key, value] of Object.entries(rest)) {
        ret[key] = value
      }

      const retRepo = manager.withRepository(this.returnRepository_)
      return await retRepo.save(ret)
    })
  }

  /**
   * Creates a return request for an order, with given items, and a shipping
   * method. If no refund amount is provided the refund amount is calculated from
   * the return lines and the shipping cost.
   * @param data - data to use for the return e.g. shipping_method,
   *    items or refund_amount
   * @return the created return
   */
  async create(data: CreateReturnInput): Promise<Return | never> {
    return await this.atomicPhase_(async (manager) => {
      const returnRepository = manager.withRepository(this.returnRepository_)

      const orderId = data.order_id
      if (data.swap_id) {
        delete (data as Partial<CreateReturnInput>).order_id
      }

      for (const item of data.items ?? []) {
        const line = await this.lineItemService_
          .withTransaction(manager)
          .retrieve(item.item_id, {
            relations: ["order", "swap", "claim_order"],
          })

        if (
          line.order?.canceled_at ||
          line.swap?.canceled_at ||
          line.claim_order?.canceled_at
        ) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Cannot create a return for a canceled item.`
          )
        }
      }

      const order = await this.orderService_
        .withTransaction(manager)
        .retrieve(orderId, {
          select: ["refunded_total", "total", "refundable_amount"],
          relations: [
            "swaps",
            "swaps.additional_items",
            "swaps.additional_items.tax_lines",
            "claims",
            "claims.additional_items",
            "claims.additional_items.tax_lines",
            "items",
            "items.tax_lines",
            "region",
            "region.tax_rates",
          ],
        })

      const returnLines = await this.getFulfillmentItems(
        order,
        data.items ?? [],
        this.validateReturnLineItem
      )

      let toRefund = data.refund_amount
      if (isDefined(toRefund)) {
        // Merchant wants to do a custom refund amount; we check if amount is
        // refundable
        const refundable = order.refundable_amount

        if (toRefund! > refundable) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            "Cannot refund more than the original payment"
          )
        }
      } else {
        // Merchant hasn't specified refund amount so we calculate it
        toRefund = await this.totalsService_.getRefundTotal(order, returnLines)
      }

      const method = data.shipping_method
      delete data.shipping_method

      const returnObject = {
        ...data,
        status: ReturnStatus.REQUESTED,
        refund_amount: Math.floor(toRefund!),
      }

      const returnReasons = await this.returnReasonService_
        .withTransaction(manager)
        .list(
          { id: [...returnLines.map((rl) => rl.reason_id as string)] },
          { relations: ["return_reason_children"] }
        )

      if (returnReasons.some((rr) => rr.return_reason_children?.length > 0)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Cannot apply return reason category"
        )
      }

      const rItemRepo = manager.withRepository(this.returnItemRepository_)
      returnObject.items = returnLines.map((i) =>
        rItemRepo.create({
          item_id: i.id,
          quantity: i.quantity,
          requested_quantity: i.quantity,
          reason_id: i.reason_id,
          note: i.note,
          metadata: i.metadata,
        })
      )

      const created = returnRepository.create(returnObject)
      const result = await returnRepository.save(created)

      if (method && method.option_id) {
        const shippingMethod = await this.shippingOptionService_
          .withTransaction(manager)
          .createShippingMethod(
            method.option_id,
            {},
            {
              price: method.price,
              return_id: result.id,
            }
          )

        const calculationContext =
          await this.totalsService_.getCalculationContext(order)

        const taxLines = await this.taxProviderService_
          .withTransaction(manager)
          .createShippingTaxLines(shippingMethod, calculationContext)

        const shippingTotal =
          shippingMethod.price +
          taxLines.reduce(
            (acc, tl) =>
              acc + Math.round(shippingMethod.price * (tl.rate / 100)),
            0
          )

        if (typeof data.refund_amount === "undefined") {
          result.refund_amount = toRefund! - shippingTotal
          return await returnRepository.save(result)
        }
      }

      return result
    })
  }

  async fulfill(returnId: string): Promise<Return | never> {
    return await this.atomicPhase_(async (manager) => {
      const returnOrder = await this.retrieve(returnId, {
        relations: [
          "items",
          "shipping_method",
          "shipping_method.tax_lines",
          "shipping_method.shipping_option",
          "swap",
          "claim_order",
        ],
      })

      if (returnOrder.status === "canceled") {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Cannot fulfill a canceled return"
        )
      }

      const returnData = { ...returnOrder }

      const items = await this.lineItemService_.withTransaction(manager).list(
        {
          id: returnOrder.items.map(({ item_id }) => item_id),
        },
        {
          relations: [
            "tax_lines",
            "variant",
            "variant.product",
            "variant.product.profiles",
          ],
        }
      )

      returnData.items = returnOrder.items.map((item) => {
        const found = items.find((i) => i.id === item.item_id)
        return {
          ...item,
          item: found,
        } as ReturnItem
      })

      if (returnOrder.shipping_data) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Return has already been fulfilled"
        )
      }

      if (returnOrder.shipping_method === null) {
        return returnOrder
      }

      returnOrder.shipping_data =
        await this.fulfillmentProviderService_.createReturn(returnData)

      const returnRepo = manager.withRepository(this.returnRepository_)
      return await returnRepo.save(returnOrder)
    })
  }

  /**
   * Registers a previously requested return as received. This will create a
   * refund to the customer. If the returned items don't match the requested
   * items the return status will be updated to requires_action. This behaviour
   * is useful in sitautions where a custom refund amount is requested, but the
   * retuned items are not matching the requested items. Setting the
   * allowMismatch argument to true, will process the return, ignoring any
   * mismatches.
   * @param returnId - the orderId to return to
   * @param receivedItems - the items received after return.
   * @param refundAmount - the amount to return
   * @param allowMismatch - whether to ignore return/received
   * product mismatch
   * @return the result of the update operation
   */
  async receive(
    returnId: string,
    receivedItems: OrdersReturnItem[],
    refundAmount?: number,
    allowMismatch = false,
    context: { locationId?: string } = {}
  ): Promise<Return | never> {
    return await this.atomicPhase_(async (manager) => {
      const returnRepository = manager.withRepository(this.returnRepository_)

      const returnObj = await this.retrieve(returnId, {
        relations: ["items", "swap", "swap.additional_items"],
      })

      if (returnObj.status === ReturnStatus.CANCELED) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Cannot receive a canceled return"
        )
      }

      let orderId = returnObj.order_id
      // check if return is requested on a swap
      if (returnObj.swap) {
        orderId = returnObj.swap.order_id
      }

      const order = await this.orderService_
        .withTransaction(manager)
        .retrieve(orderId!, {
          relations: [
            "items",
            "returns",
            "payments",
            "discounts",
            "discounts.rule",
            "refunds",
            "shipping_methods",
            "shipping_methods.shipping_option",
            "region",
            "swaps",
            "swaps.additional_items",
            "claims",
            "claims.additional_items",
          ],
        })

      if (returnObj.status === ReturnStatus.RECEIVED) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Return with id ${returnId} has already been received`
        )
      }

      const returnLines = await this.getFulfillmentItems(
        order,
        receivedItems,
        this.validateReturnLineItem
      )

      const newLines = returnLines.map((l) => {
        const existing = returnObj.items.find((i) => l.id === i.item_id)
        if (existing) {
          return {
            ...existing,
            quantity: l.quantity,
            requested_quantity: existing.quantity,
            received_quantity: l.quantity,
            is_requested: l.quantity === existing.quantity,
          }
        } else {
          return {
            return_id: returnObj.id,
            item_id: l.id,
            quantity: l.quantity,
            is_requested: false,
            received_quantity: l.quantity,
            metadata: l.metadata || {},
          }
        }
      })

      let returnStatus = ReturnStatus.RECEIVED

      const isMatching = newLines.every((l) => l.is_requested)
      if (!isMatching && !allowMismatch) {
        returnStatus = ReturnStatus.REQUIRES_ACTION
      }

      const totalRefundableAmount = refundAmount ?? returnObj.refund_amount

      const now = new Date()
      const updateObj = {
        ...returnObj,
        location_id: context.locationId || returnObj.location_id,
        status: returnStatus,
        items: newLines,
        refund_amount: totalRefundableAmount,
        received_at: now.toISOString(),
      }

      const result = await returnRepository.save(updateObj)

      const lineItemServiceTx = this.lineItemService_.withTransaction(manager)
      for (const i of returnObj.items) {
        const lineItem = await lineItemServiceTx.retrieve(i.item_id)
        const returnedQuantity = (lineItem.returned_quantity || 0) + i.quantity
        await lineItemServiceTx.update(i.item_id, {
          returned_quantity: returnedQuantity,
        })
      }

      const productVarInventoryTx =
        this.productVariantInventoryService_.withTransaction(manager)

      for (const line of newLines) {
        const orderItem = order.items.find((i) => i.id === line.item_id)
        if (orderItem && orderItem.variant_id) {
          await productVarInventoryTx.adjustInventory(
            orderItem.variant_id,
            result.location_id!,
            line.received_quantity
          )
        }
      }

      return result
    })
  }
}

export default ReturnService
