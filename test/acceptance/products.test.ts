import { datatype } from 'faker'
import { productRepositoryFactory } from '../../src/domain/productRepository'
import { testDynamoClient } from '../awsTestClients'
import { testProduct } from '../testFactories'

const repository = productRepositoryFactory(testDynamoClient)

describe('products', () => {
  it('adds a new product without id', async () => {
    const product = testProduct({ id: undefined })

    const result = await repository.saveProduct(product)

    expect(result).toEqual({
      id: expect.any(String),
      price: product.price,
      name: product.name
    })
  })

  it('adds a new product with id', async () => {
    const product = testProduct()

    const result = await repository.saveProduct(product)

    expect(result).toEqual(product)
  })

  it('get product not found returns undefined', async () => {
    const result = await repository.getProductById('this-id-does-not-exist')

    expect(result).toEqual(undefined)
  })

  it('edits an existing product', async () => {
    const product = testProduct()

    await repository.saveProduct(product)
    const updated = await repository.saveProduct({
      ...product,
      price: datatype.number()
    })

    const result = await repository.getProductById(product.id!)

    expect(result).toEqual(updated)
  })
})
