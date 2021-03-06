import {
  AttributeMap,
  DeleteItemInput,
  DeleteItemOutput,
  DocumentClient,
  GetItemInput,
  GetItemOutput,
  QueryInput,
  QueryOutput,
  PutItemInput,
  PutItemOutput
} from 'aws-sdk/clients/dynamodb'
import { AWSError } from 'aws-sdk'
import { PromiseResult } from 'aws-sdk/lib/request'

export interface DynamoClient {
  scan: (
    TableName: string
  ) => Promise<PromiseResult<DocumentClient.ScanOutput, AWSError>>
  putItem: <T>(
    item: T,
    table: string,
    params?: Partial<PutItemInput>
  ) => Promise<PutItemOutput | AWSError>
  updateItem: (
    params: DocumentClient.UpdateItemInput
  ) => Promise<DocumentClient.UpdateItemOutput>
  getItem: (params: GetItemInput) => Promise<GetItemOutput>
  deleteItem: (params: DeleteItemInput) => Promise<DeleteItemOutput>
  query: (params: QueryInput) => Promise<QueryOutput>
  truncateTable: (
    TableName: string,
    hash: string,
    range?: string
  ) => Promise<void>
  executeTransactWrite: (
    params: DocumentClient.TransactWriteItemsInput
  ) => Promise<DocumentClient.TransactWriteItemsOutput>
}

export const createDynamoClient = (client: DocumentClient): DynamoClient => {
  // https://github.com/aws/aws-sdk-js/issues/2464#issuecomment-503524701
  const executeTransactWrite = (
    params: DocumentClient.TransactWriteItemsInput
  ): Promise<DocumentClient.TransactWriteItemsOutput> => {
    const transactionRequest = client.transactWrite(params)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cancellationReasons: any[]
    transactionRequest.on('extractError', response => {
      try {
        cancellationReasons = JSON.parse(
          response.httpResponse.body.toString()
        ).CancellationReasons
      } catch (err) {
        // just in case some types of errors can't be JSON parsed
        console.error('Error extracting cancellation error', err)
      }
    })
    return new Promise((resolve, reject) => {
      transactionRequest.send((err, response) => {
        if (err) {
          console.error('Error performing transactWrite', {
            cancellationReasons,
            err
          })
          return reject(err)
        }
        return resolve(response)
      })
    })
  }

  const scan = async (
    TableName: string
  ): Promise<PromiseResult<DocumentClient.ScanOutput, AWSError>> =>
    client.scan({ TableName }).promise()

  const updateItem = async (
    params: DocumentClient.UpdateItemInput
  ): Promise<DocumentClient.UpdateItemOutput> => client.update(params).promise()

  const putItem = async <T>(
    item: T,
    table: string,
    params?: Partial<PutItemInput>
  ): Promise<PutItemOutput | AWSError> =>
    client
      .put({
        TableName: table,
        Item: item,
        ...params
      })
      .promise()

  const getItem = async (params: GetItemInput): Promise<GetItemOutput> =>
    new Promise<GetItemOutput>((resolve, reject) => {
      client.get(params, (err, data) => {
        if (err) {
          reject(err)
        }
        resolve(data)
      })
    })

  const deleteItem = async (
    params: DeleteItemInput
  ): Promise<DeleteItemOutput> =>
    new Promise<DeleteItemOutput>((resolve, reject) => {
      client.delete(params, (err, data) => {
        if (err) {
          reject(err)
        }
        resolve(data)
      })
    })

  const query = async (params: QueryInput): Promise<QueryOutput> =>
    new Promise<QueryOutput>((resolve, reject) => {
      client.query(params, (err, data) => {
        if (err) {
          reject(err)
        }
        resolve(data)
      })
    })

  const getItemKeyAndValue = (item: AttributeMap, key?: string) =>
    key ? { [`${key}`]: item[`${key}`] } : {}

  const truncateTable = async (
    TableName: string,
    hash: string,
    range?: string
  ): Promise<void> => {
    const { Items } = await client.scan({ TableName }).promise()
    if (!Items) {
      return
    }
    const keys = Items.map(item => ({
      ...getItemKeyAndValue(item, hash),
      ...getItemKeyAndValue(item, range)
    }))
    if (!keys.length) {
      return
    }
    await Promise.all(keys?.map(Key => deleteItem({ TableName, Key })))
  }

  return {
    putItem,
    updateItem,
    deleteItem,
    getItem,
    query,
    truncateTable,
    scan,
    executeTransactWrite
  }
}
