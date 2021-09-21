import { omit } from 'ramda'
import { DynamoClient } from '../dynamoClient'
import { DDB_TABLE } from '../constants'
import { v4 as uuidv4 } from 'uuid'
import { addPrefix, removePrefix } from '../utils'
import { CUSTOMER_PREFIX } from './customerService'

const ORDER_PREFIX = 'o#'
const entityType = 'order'

const dynamoRecordToRecord = (record: any): Order => {
  const { pk, sk, ...data } = record

  return omit(['sk', 'entityType'], {
    ...data,
    id: removePrefix(pk, ORDER_PREFIX),
    customerId: removePrefix(sk, CUSTOMER_PREFIX)
  }) as Order
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const orderServiceFactory = (client: DynamoClient) => {
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
    date,
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

  return {
    getCustomerOrderById,
    saveCustomerOrder
  }
}