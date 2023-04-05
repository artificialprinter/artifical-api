import '@shopify/shopify-api/adapters/node';
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import { restResources } from '@shopify/shopify-api/rest/admin/2023-01';

const hostName = 'artificial-printer.myshopify.com';
const scopes = ['write_products', 'read_products', 'read_orders'];

const { SHOPIFY_API_KEY, SHOPIFY_ACCESS_TOKEN } = process.env;

// https://github.com/Shopify/shopify-api-js/blob/main/docs/guides/custom-store-app.md
const shopify = shopifyApi({
  apiKey: SHOPIFY_API_KEY,
  apiSecretKey: SHOPIFY_ACCESS_TOKEN,
  apiVersion: LATEST_API_VERSION,
  isCustomStoreApp: true,                     // this MUST be set to true (default is false)
  scopes,
  isEmbeddedApp: false,
  hostName,
  customShopDomains: ['artificialprinter.com'],
  // Mount REST resources.
  restResources,
});
export const session = shopify.session.customAppSession(hostName);

const activeWebhooks = await shopify.rest.Webhook.all({ session });

console.log(...activeWebhooks);
let orderWebhook = activeWebhooks.find(item => item.topic === 'carts/update');
if (orderWebhook) {
  console.log('orderWebhook :>> ', orderWebhook.id);
  await shopify.rest.Webhook.delete({
    session,
    id: orderWebhook.id,
  });
  orderWebhook = null;
}
if (!orderWebhook) {
  const webhook = new shopify.rest.Webhook({ session });

  webhook.topic = 'orders/update';
  webhook.address = process.env.CYCLIC_URL + '/webhooks/shopify-order';
  webhook.format = 'json';
  webhook.metafield_namespaces = ['global'];
  webhook.fields = [
    'id',
    'line_items',
    'metafields'
  ];
  await webhook.save({
    update: true,
  });

  orderWebhook = webhook;
}

const colorCodes = {
  White: 873,
  Black: 874
};
const PRICE = 34.99;
const COLORS = 'White,Black'.split(',');
const SIZES = 'S,M,L,XL,XXL'.split(',');

const variants = []; // Sad that Shopify don't handle it automatically =( 

for (const color of COLORS) for (const size of SIZES) { // =(
  variants.push({ // =(
    option1: color, // =(
    option2: size, // =(
    price: PRICE, // =(
    sku: ['UCTS', size, colorCodes[color], ''].join('-')
  }); // =(
} // =(

export async function createProduct({
  title,
  description = 'T-shirt that is made by you. For you.',
  img = 'https://cataas.com/cat',
  skuId,
}) {
  const product = new shopify.rest.Product({ session: session });
  product.title = title + ' - ' + Math.ceil(Math.random() * 999);
  product.body_html = description;
  product.vendor = 'Printify';
  product.product_type = 'T-Shirt';
  // product.price = 39.99;
  // eslint-disable-next-line quotes
  product.tags = "Cotton, Crew neck, DTG, Men's Clothing, Regular fit, T-shirts, Unisex, Women's Clothing",
  product.images = [
    {
      [typeof img === 'string' && img.startsWith('https:') ? 'src' : 'attachment']: img
    }
  ];
  product.variants = variants.map(v => ({
    ...v,
    sku: ['UCTS', skuId, colorCodes[v.option1], v.option2].join('-')
  })); // =(
  product.options = [
    {
      name: 'Color',
      values: [
        'White',
        'Black'
      ]
    },
    {
      name: 'Size',
      values: [
        'M',
        'S',
        'L',
        'XL',
        'XXL',
      ]
    }
  ];
  product.metafields = [{
    key: 'skuId',
    value: skuId,
    type: 'single_line_text_field',
    namespace: 'global',
  }];

  await product.save({
    update: true,
  });

  return product;
}

export async function updateMetafields(Entity, id, metafields) {
  const item = new Entity({ session: session });

  item.id = id;
  item.metafields = Object.entries(metafields).map(([key, value]) => ({
    key, value, type: 'single_line_text_field', namespace: 'global'
  }));

  await item.save();
}

export function getProduct(id) {
  return shopify.rest.Product.find({
    session: session,
    id,
  });
}

export const Order = shopify.rest.Order;
export const Product = shopify.rest.Product;
export const Metafield = shopify.rest.Metafield;

export default {
  getProduct,
  createProduct,
  updateMetafields,
  Order: shopify.rest.Order,
  Product: shopify.rest.Product,
};
