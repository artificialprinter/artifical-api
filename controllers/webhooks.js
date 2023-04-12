import express from 'express';

import TimeLogger from '../util/time-logger.js';
import { imagesCollection } from '../util/db.js';
import serverEvent from '../util/server-event.js';
import shopify, { Metafield, Product, session, updateMetafields } from '../util/shopify.js';
import { generateTShirtProduct, getBlueprints, getShops, uploadImage } from '../util/printify.js';

export default function webhooksController() {
  const webhooksRouter = express.Router();

  webhooksRouter.post('/replicate-scale', replicateScale);
  webhooksRouter.post('/shopify-order', shopifyOrder);

  return webhooksRouter;
}

async function replicateScale(req, res) {
  const { input, output, id: imgId } = req.body;
  if (output) {
    const {
      requestId
    } = input;
    const name = (input.name || input.image.split('/').at(-1)).slice(5, -4);
    const id = name || imgId;
    console.log({ name, imgId });
    const uploadToPrintifyRes = await uploadImage(`ai-${id}.png`, output);

    console.log('uploadToPrintifyRes.id :>> ', uploadToPrintifyRes.id);

    const updateResult = await imagesCollection.updateOne(
      {
        [`images.${id}`]: { $exists: true }
      },
      {
        $set: {
          [`images.${id}.imageFull`]: output,
          [`images.${id}.printifyId`]: uploadToPrintifyRes.id
        }
      }
    );
    serverEvent.trigger(requestId, '1', {
      step: 3,
      images: {
        [id]: {
          printifyId: uploadToPrintifyRes.id
        }
      }
    });

    res.status(200).send(updateResult);
  } else {
    res.statusCode = 500;
    res.end(JSON.stringify({ detail: 'There is an error in Scale: output is empty. Images did not generated' }));
  }
}

async function shopifyOrder(req, res) {
  console.log('post req.body :>> ', req.body);
  const logger = TimeLogger('webhook/order-' + req.body.id);

  for await (const item of req.body.line_items) {
    const productId = item.product_id;
    const shopifyProduct = await shopify.getProduct(productId);

    delete shopifyProduct.variants; logger('shopify product loaded', shopifyProduct);
    const metafields = await Metafield.all({
      session,
      metafield: {
        owner_id: productId,
        owner_resource: 'product'
      },
    }); logger('metafields loaded', metafields);

    const skuId = (shopifyProduct.metafields || metafields).find(item => item.key === 'skuId')?.value;
    if (!skuId) return console.error('no sku id', productId);
    const doc = await imagesCollection.findOne({
      requestId: skuId.slice(0, -1)
    }); logger('doc loaded', doc._id);
    const imgKey = Object.keys(doc.images)[+skuId.slice(-1)];

    if (doc.images[imgKey].printifyId) return; // printify product exists

    //  todo use upscaled on printify
    // const upscaling = upscaleImage(croppedImg.url, croppedImg.name, requestId); logger(i + '_crop write done');

    const { id: printifyId } = await uploadImage(`ai-${skuId}.png`, doc.images[imgKey].generatedImg); logger('printify uploaded', printifyId);

    const { id: printifyProductId } = await generateTShirtProduct(
      await getShops,
      await getBlueprints,
      printifyId,
      doc.initialPrompt,
      shopifyProduct.handle.split('-').at(-1)
    ); logger('generateTShirtProduct', printifyProductId);

    if (!printifyProductId) {
      console.error('missing printifyProductId')
    }

    await imagesCollection.updateOne({ _id: doc._id }, {
      $set: {
        [`images.${imgKey}.printifyId`]: printifyId,
        [`images.${imgKey}.printifyProductId`]: printifyProductId
      }
    }); logger('updated printifyProductId');

    await updateMetafields(Product, productId, {
      printifyProductId: printifyProductId
    }); logger('updated Metafields');

    console.log('printify product id added to shopify product metadata :>> ', {
      shopifyProductId: productId,
      printifyProductId: printifyProductId
    });
  }
  logger(TimeLogger.END);
  res.statusCode = 200;
  res.end();
} 
