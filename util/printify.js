const apiKey = process.env.PRINTIFY_API_KEY;
const SHOP_NAME = 'Artificial Printer';
const T_SHIRT_BLUEPRINT_NAME = 'Unisex Ultra Cotton Tee';
const T_SHIRT_PRINT_PROVIDER_NAME = 'SwiftPOD';
const T_SHIRT_PRICE = 3999;

export const uploadImage = async (imageName, imageUrl) => {
    const headers = new Headers();
    
    headers.append('Content-Type', 'application/json');
    headers.append('Authorization', `Bearer ${apiKey}`);
    
    const requestOptions = {
        method: 'POST',
        headers,
        body: JSON.stringify({
            'file_name': imageName,
            'url': imageUrl
        }),
        redirect: 'follow'
      };
      
    const imageResult = await fetch('https://api.printify.com/v1/uploads/images.json', requestOptions);

    return await imageResult.json();
};

export const getShops = async () => {
    const headers = new Headers();
    
    headers.append('Authorization', `Bearer ${apiKey}`);
    
    const requestOptions = {
        method: 'GET',
        headers,
        redirect: 'follow'
      };
      
    const shops = await fetch('https://api.printify.com/v1/shops.json', requestOptions);

    return await shops.json();
};

export const getBlueprints = async () => {
    const headers = new Headers();
    
    headers.append('Authorization', `Bearer ${apiKey}`);

    const requestOptions = {
        method: 'GET',
        headers: headers,
        redirect: 'follow'
      };
      
    const blueprints = await fetch('https://api.printify.com/v1/catalog/blueprints.json', requestOptions);

    return await blueprints.json();
};

export const getPrintProviders = async (blueprint) => {
    const headers = new Headers();
    
    headers.append('Authorization', `Bearer ${apiKey}`);

    const requestOptions = {
        method: 'GET',
        headers: headers,
        redirect: 'follow'
      };
      
    const providers = await fetch(`https://api.printify.com/v1/catalog/blueprints/${blueprint}/print_providers.json`, requestOptions);

    return await providers.json();
};

export const getProviderVariants = async (blueprint, provider) => {
    const headers = new Headers();
    
    headers.append('Authorization', `Bearer ${apiKey}`);

    const requestOptions = {
        method: 'GET',
        headers: headers,
        redirect: 'follow'
      };
      
    const variants = await fetch(`https://api.printify.com/v1/catalog/blueprints/${blueprint}/print_providers/${provider}/variants.json`, requestOptions);

    return await variants.json();
};

export const generateTShirtProduct = async (shops, blueprints, imageId, prompt) => {
    const shopId = shops.filter((shop) => shop.title === SHOP_NAME)[0]?.id;
    const blueprintId = blueprints.filter((blueprint) => blueprint.title === T_SHIRT_BLUEPRINT_NAME)[0]?.id;
    
    console.log('shops', shops);
    console.log('shopId', shopId);
    console.log('blueprintId', blueprintId);

    const providers = await getPrintProviders(blueprintId);
    const providerId = providers.filter((provider) => provider.title === T_SHIRT_PRINT_PROVIDER_NAME)[0].id;

    const variants = await getProviderVariants(blueprintId, providerId);

    console.log('variants', variants);

    const headers = new Headers();
    
    headers.append('Authorization', `Bearer ${apiKey}`);
    headers.append('Content-Type', 'application/json');

    const requestOptions = {
        method: 'POST',
        headers: headers,
        redirect: 'follow',
        body: JSON.stringify({
            'title': 'Artifical Printed T-Shirt',
            'description': prompt || '',
            'blueprint_id': blueprintId,
            'print_provider_id': providerId,
            'variants': variants.variants.map((variant) => {
                return {
                    id: variant.id,
                    price: T_SHIRT_PRICE,
                    is_enabled: true
                };
            }),
              'print_areas': [
                {
                  'variant_ids': variants.variants.map((variant) => variant.id),
                  'placeholders': [
                    {
                      'position': 'front',
                      'images': [
                          {
                            'id': imageId, 
                            'x': 0.5, 
                            'y': 0.5, 
                            'scale': 0.25,
                            'angle': 0
                          }
                      ]
                    }
                  ]
                }
              ]
          })
    };

    const product = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json`, requestOptions);
    const productResult = await product.json();

    console.log('product', productResult);

    const publishProduct = await fetch(`https://api.printify.com/v1/shops/${shopId}/products/${productResult.id}/publish.json`, {
        method: 'POST',
        headers: headers,
        redirect: 'follow',
    });

    return await publishProduct.json();
};