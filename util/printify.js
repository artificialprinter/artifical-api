const apiKey = process.env.PRINTIFY_API_KEY;
const SHOP_NAME = 'Artificial Printer';
const T_SHIRT_BLUEPRINT_NAME = 'Artificial Printer';

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

export const generateTShirtProduct = async (shops, blueprints, imageId) => {
    console.log('imageId:', imageId);
    
    const shopId = shops.filter((shop) => shop.title === SHOP_NAME)[0]?.id;
    const blueprintId = blueprints.filter((blueprint) => blueprint.title === T_SHIRT_BLUEPRINT_NAME)[0]?.id;

    console.log('shops', shops);
    console.log('shopId', shopId);
    console.log('blueprintId', blueprintId);

    return {};
};