import { omit, pathOr } from 'ramda'
import { DynamoClient } from '../dynamoClient'
import { DDB_TABLE } from '../constants'
import { v4 as uuidv4 } from 'uuid'
import { addPrefix, removePrefix } from '../utils'
import { ORDER_PREFIX } from './orderRepository'
import { QueryInput } from 'aws-sdk/clients/dynamodb'

const INVOICE_PREFIX = 'i#'
const entityType = 'invoice'

const dynamoRecordToRecord = (record: any): Invoice => {
  const { gsi1_pk, pk, ...data } = record

  return omit(['sk', 'entityType', 'gsi1_sk'], {
    ...data,
    id: removePrefix(gsi1_pk, INVOICE_PREFIX),
    orderId: removePrefix(pk, ORDER_PREFIX)
  }) as Invoice
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const invoiceRepositoryFactory = (client: DynamoClient) => {
  const saveOrderInvoice = async ({
    id,
    orderId,
    payments = [],
    amount,
    date = new Date().toISOString()
  }: Invoice): Promise<Invoice> => {
    const _id = id ? id : uuidv4()

    const record = {
      pk: addPrefix(orderId, ORDER_PREFIX),
      sk: addPrefix(_id, INVOICE_PREFIX),
      gsi1_pk: addPrefix(_id, INVOICE_PREFIX),
      gsi1_sk: addPrefix(_id, INVOICE_PREFIX),
      payments,
      amount,
      date,
      entityType
    }

    await client.putItem(record, DDB_TABLE)

    return {
      id: _id,
      orderId,
      payments,
      amount,
      date
    }
  }

  const getInvoiceById = async (
    invoiceId: string
  ): Promise<Invoice | undefined> =>
    client
      .query({
        TableName: DDB_TABLE,
        IndexName: 'gsi1',
        KeyConditionExpression: '#gsi1_pk = :gsi1_pk and #gsi1_sk = :gsi1_sk',
        ExpressionAttributeNames: {
          '#gsi1_pk': 'gsi1_pk',
          '#gsi1_sk': 'gsi1_sk'
        },
        ExpressionAttributeValues: {
          ':gsi1_pk': addPrefix(invoiceId, INVOICE_PREFIX),
          ':gsi1_sk': addPrefix(invoiceId, INVOICE_PREFIX)
        }
      } as QueryInput)
      .then(res => {
        const record = pathOr<Invoice | undefined>(
          undefined,
          ['Items', '0'],
          res
        )
        return record ? dynamoRecordToRecord(record) : undefined
      })

  const getInvoiceByOrderId = async (orderId: string) =>
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
          ':sk': INVOICE_PREFIX
        }
      } as QueryInput)
      .then(res => {
        const record = pathOr<Invoice | undefined>(
          undefined,
          ['Items', '0'],
          res
        )
        return record ? dynamoRecordToRecord(record) : undefined
      })

  return {
    saveOrderInvoice,
    getInvoiceById,
    getInvoiceByOrderId
  }
}
