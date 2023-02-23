const apiKey = process.env.PRINTIFY_API_KEY;

export const uploadImage = async (imageName, imageUrl) => {
    const headers = new Headers();
    
    headers.append('Content-Type', 'application/json');
    headers.append('Authorization', apiKey);
    
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
    
    headers.append('Authorization', apiKey);
    
    const requestOptions = {
        method: 'GET',
        headers,
        redirect: 'follow'
      };
      
    const shops = await fetch('https://api.printify.com/v1/shops.json', requestOptions);

    return await shops.json();
};

export const generateProduct = async (imageId) => {
    //imageId
};