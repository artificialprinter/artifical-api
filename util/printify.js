import TimeLogger from './time-logger.js';

const apiKey = process.env.PRINTIFY_API_KEY;
const SHOP_NAME = 'Artificial Printer';
const T_SHIRT_BLUEPRINT_NAME = 'Unisex Jersey Short Sleeve Tee';
const T_SHIRT_PRINT_PROVIDER_NAME = 'SwiftPOD';
const T_SHIRT_PRICE = 3999;
const T_SHIRT_VARIANTS = [
  'Black / S',
  'Black / M',
  'Black / L',
  'Black / XL',
  'Black / XXL',
  'White / S',
  'White / M',
  'White / L',
  'White / XL',
  'White / XXL',
];

let providersCache = {};

async function callPrintify(route, data) {
  const headers = new Headers();

  headers.append('Authorization', `Bearer ${apiKey}`);
  headers.append('Content-Type', 'application/json');

  const requestOptions = {
    method: data ? 'POST' : 'GET',
    headers,
    ...data && { body: JSON.stringify(data) },
    redirect: 'follow'
  };

  const response = await fetch('https://api.printify.com/' + route, requestOptions);

  return response.json();
}

export const uploadImage = async (imageName, imageUrl) => {
  return callPrintify('v1/uploads/images.json', {
    'file_name': imageName,
    'url': imageUrl
  });
};

export const getShops = callPrintify('v1/shops.json');
export const getBlueprints = callPrintify('v1/catalog/blueprints.json');

export const getPrintProviders = async (blueprint) => {
  if (providersCache[blueprint]) return providersCache[blueprint];
    
  providersCache[blueprint] = await callPrintify(`v1/catalog/blueprints/${blueprint}/print_providers.json`);

  return providersCache[blueprint];
};

export const getProviderVariants = async (blueprint, provider) => {
  if (providersCache[blueprint + provider]) return providersCache[blueprint + provider];
  
  providersCache[blueprint + provider] = callPrintify(`v1/catalog/blueprints/${blueprint}/print_providers/${provider}/variants.json`);

  return providersCache[blueprint + provider];
};

export const generateTShirtProduct = async (shops, blueprints, imageId, prompt, number) => {
  const timeLog = TimeLogger('generateTShirtProduct');
  const shopId = shops.filter((shop) => shop.title === SHOP_NAME)[0]?.id;
  const blueprintId = blueprints.filter((blueprint) => blueprint.title === T_SHIRT_BLUEPRINT_NAME)[0]?.id;
  const providers = await getPrintProviders(blueprintId); timeLog('getPrintProviders', providers.length);

  const tShirtProviders = providers.filter((provider) => provider.title === T_SHIRT_PRINT_PROVIDER_NAME);
  console.log('tShirtProviders :>> ', tShirtProviders);
  const providerId = tShirtProviders[0].id;

  const variants = await getProviderVariants(blueprintId, providerId); timeLog('getProviderVariants');
  const filteredVariants = variants.variants.filter((variant) => T_SHIRT_VARIANTS.includes(variant.title));
  const userPrompt = prompt.charAt(0).toUpperCase() + prompt.slice(1);
  const filteredOptions = new Set(filteredVariants.reduce((prev, curr) => {
    prev.push(...Object.values(curr.options));
    return prev;
  }, []));

  console.log('filteredOptions', filteredOptions.length, ...filteredOptions);
  console.log('filteredVariants', filteredVariants.length, ...filteredOptions);

  const requestOptions = {
    'title': `${userPrompt} - ${number || Math.floor(Math.random() * 1000)}`,
    'description': prompt || '',
    'blueprint_id': blueprintId,
    'print_provider_id': providerId,
    'variants': filteredVariants.map((variant) => {
        return {
            id: variant.id,
            price: T_SHIRT_PRICE,
            options: [873,874,14,15,16,17,18],
            is_enabled: true
        };
    }),
    'print_areas': [
      {
        'variant_ids': filteredVariants.map((variant) => variant.id),
        'placeholders': [
          {
            'position': 'front',
            'images': [
                {
                  'id': imageId, 
                  'x': 0.5, 
                  'y': 0.5, 
                  'scale': 1,
                  'angle': 0
                }
            ]
          }
        ]
      }
    ]
  };

  const productResult = await callPrintify(`v1/shops/${shopId}/products.json`, requestOptions); timeLog('productResult');

  // todo: determinse do we need  to publish product in strategy: ai - shopify - printify
  // await callPrintify(
  //   `v1/shops/${shopId}/products/${productResult.id}/publish.json`,
  //   {
  //     'title': true,
  //     'description': true,
  //     'images': false,
  //     'variants': false,
  //     'tags': true,
  //     'keyFeatures': true,
  //     'shipping_template': true
  //   }
  // );

  timeLog(TimeLogger.END);

  return productResult;
};
