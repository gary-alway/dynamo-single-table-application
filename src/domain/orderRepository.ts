import { omit, pathOr } from 'ramda'
import { DynamoClient } from '../dynamoClient'
import { DDB_TABLE } from '../constants'
import { v4 as uuidv4 } from 'uuid'
import { addPrefix, removePrefix } from '../utils'
import { CUSTOMER_PREFIX } from './customerRepository'
import { PRODUCT_PREFIX } from './productRepository'
import { QueryInput } from 'aws-sdk/clients/dynamodb'

export const ORDER_PREFIX = 'o#'
const SHIPMENT_ITEM_PREFIX = 'd#'
const entityType = 'order'
const orderItemEntityType = 'orderItem'
const shipmentItemEntityType = 'shipmentItem'

const dynamoRecordToRecord = (record: any): Order => {
  const { pk, sk, ...data } = record

  return omit(['sk', 'entityType'], {
    ...data,
    id: removePrefix(pk, ORDER_PREFIX),
    customerId: removePrefix(sk, CUSTOMER_PREFIX)
  }) as Order
}

const dynamoRecordToOrderItemRecord = (record: any): OrderItem => {
  const { pk, sk, gsi2_pk, ...data } = record

  return omit(['entityType', 'gsi1_pk', 'gsi1_sk', 'gsi2_sk'], {
    ...data,
    orderId: removePrefix(pk, ORDER_PREFIX),
    productId: removePrefix(sk, PRODUCT_PREFIX),
    customerId: removePrefix(gsi2_pk, CUSTOMER_PREFIX)
  }) as OrderItem
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const orderRepositoryFactory = (client: DynamoClient) => {
  const getCustomerOrderById = async (
    orderId: string,
    customerId: string
  ): Promise<Order | undefined> =>
    client
      .getItem({
        TableName: DDB_TABLE,
        Key: {
          pk: addPrefix(orderId, ORDER_PREFIX),
          sk: addPrefix(customerId, CUSTOMER_PREFIX)
        } as any
      })
      .then(({ Item }) => (Item ? dynamoRecordToRecord(Item) : undefined))

  const saveCustomerOrder = async ({
    id,
    date = new Date().toISOString(),
    customerId
  }: Order): Promise<Order> => {
    const _id = id ? removePrefix(id, ORDER_PREFIX) : uuidv4()
    const _customerId = removePrefix(customerId, CUSTOMER_PREFIX)

    const record = {
      pk: addPrefix(_id, ORDER_PREFIX),
      sk: addPrefix(_customerId, CUSTOMER_PREFIX),
      date,
      entityType
    }

    await client.putItem(record, DDB_TABLE)

    return {
      id: _id,
      customerId: _customerId,
      date
    }
  }

  const saveOrderItem = async ({
    productId,
    orderId,
    customerId,
    price,
    quantity
  }: OrderItem) => {
    const date = new Date().toISOString()
    const record = {
      pk: addPrefix(orderId, ORDER_PREFIX),
      sk: addPrefix(productId, PRODUCT_PREFIX),
      gsi1_pk: addPrefix(productId, PRODUCT_PREFIX),
      gsi1_sk: date,
      gsi2_pk: addPrefix(customerId, CUSTOMER_PREFIX),
      gsi2_sk: date,
      price,
      quantity,
      entityType: orderItemEntityType
    }

    await client.putItem(record, DDB_TABLE)
  }

  const saveOrderShipmentItem = async ({
    id,
    orderId,
    productId,
    shipmentId,
    quantity
  }: ShipmentItem) => {
    const _id = id ? id : uuidv4()

    const record = {
      pk: addPrefix(orderId, ORDER_PREFIX),
      sk: addPrefix(_id, SHIPMENT_ITEM_PREFIX),
      productId,
      shipmentId,
      quantity,
      entityType: shipmentItemEntityType
    }

    await client.putItem(record, DDB_TABLE)
  }

  const getOrderItemsByOrderId = async (orderId: string) =>
    client
      .query({
        TableName: DDB_TABLE,
        KeyConditionExpression: '#pk = :pk and begins_with (#sk, :sk)',
        ExpressionAttributeNames: {
          '#pk': 'pk',
          '#sk': 'sk'
        },
        ExpressionAttributeValues: {
          ':pk': addPrefix(orderId, ORDER_PREFIX),
          ':sk': PRODUCT_PREFIX
        }
      } as QueryInput)
      .then(res =>
        pathOr<OrderItem[]>([], ['Items'], res).map(
          dynamoRecordToOrderItemRecord
        )
      )

  const getOrderItemsByProductId = async (
    productId: string,
    from: string,
    to: string
  ) =>
    client
      .query({
        TableName: DDB_TABLE,
        IndexName: 'gsi1',
        KeyConditionExpression:
          '#gsi1_pk = :gsi1_pk and #gsi1_sk between :from and :to',
        ExpressionAttributeNames: {
          '#gsi1_pk': 'gsi1_pk',
          '#gsi1_sk': 'gsi1_sk'
        },
        ExpressionAttributeValues: {
          ':gsi1_pk': addPrefix(productId, PRODUCT_PREFIX),
          ':from': from,
          ':to': to
        }
      } as QueryInput)
      .then(res =>
        pathOr<OrderItem[]>([], ['Items'], res).map(
          dynamoRecordToOrderItemRecord
        )
      )

  const getOrderItemsByCustomerId = async (
    customerId: string,
    from: string,
    to: string
  ) =>
    client
      .query({
        TableName: DDB_TABLE,
        IndexName: 'gsi2',
        KeyConditionExpression:
          '#gsi2_pk = :gsi2_pk and #gsi2_sk between :from and :to',
        ExpressionAttributeNames: {
          '#gsi2_pk': 'gsi2_pk',
          '#gsi2_sk': 'gsi2_sk'
        },
        ExpressionAttributeValues: {
          ':gsi2_pk': addPrefix(customerId, CUSTOMER_PREFIX),
          ':from': from,
          ':to': to
        }
      } as QueryInput)
      .then(res =>
        pathOr<OrderItem[]>([], ['Items'], res).map(
          dynamoRecordToOrderItemRecord
        )
      )

  return {
    getCustomerOrderById,
    saveCustomerOrder,
    saveOrderItem,
    saveOrderShipmentItem,
    getOrderItemsByOrderId,
    getOrderItemsByProductId,
    getOrderItemsByCustomerId
  }
}
