import timers from 'node:timers/promises';
import express from 'express';

import TimeLogger from '../util/time-logger.js';
import { imagesCollection } from '../util/db.js';
import serverEvent from '../util/server-event.js';
import { cropImageSharp, loadImageFromUrl } from '../util/image-service.js';
import { write } from '../util/filestorage.js';
import shopify, { Metafield, Product, createProduct, session, updateMetafields } from '../util/shopify.js';
import { generateTShirtProduct, getBlueprints, getShops, uploadImage } from '../util/printify.js';

export default function webhooksController() {
  const webhooksRouter = express.Router();

  webhooksRouter.post('/replicate-diffusion', replicateDiffusion);
  webhooksRouter.post('/replicate-scale', replicateScale);
  webhooksRouter.post('/shopify-order', shopifyOrder);

  return webhooksRouter;
}

async function replicateDiffusion(req, res) {
  const { id: requestId, input: { prompt }, error, output } = req.body;

  if (!requestId) {
    return res.end({ detail: 'There is an error in Diffusion: no id in body' });
  }

  const logger = TimeLogger(`webhook-diffusion_${requestId}`);

  const doc = await imagesCollection.findOne({
    requestId
  });

  logger('mongodb - doc found');

  if (error) {
    imagesCollection
      .updateOne({ _id: doc._id }, {
        $set: {
          error: error
        }
      })
      .catch(console.error);

    logger('end', error);

    return res.end({ detail: 'There is an error in Diffusion: ' + error });
  }

  const imagesObj = output.reduce((obj, url) => {
    obj[url.split('/').at(-2)] = {
      generatedImg: url
    };

    return obj;
  }, {});


  serverEvent.trigger(requestId, '1', {
    step: 1,
    images: imagesObj,
  });

  // save immediately
  imagesCollection.updateOne({ _id: doc._id }, {
    $set: {
      images: imagesObj,
      prompt
    }
  }).catch(console.error);

  // parallel 2 images
  const promises = output.map(async (imgUrl, i) => {
    const id = imgUrl.split('/').at(-2); logger(i + '_parallel');

    await timers.setTimeout(i * 100); logger(i + '_loading started');

    const bufferImage = await loadImageFromUrl(imgUrl); logger(i + '_crop waiting...');
    const croppedImg = await Promise.race([
      cropImageSharp(bufferImage, id, i),
      // cropImageJimp(bufferImage, id, i),
    ]); logger(i + '_crop done, winner ' + croppedImg.lib);

    await write(croppedImg.name, croppedImg.buffer); logger(i + 'write to s3 done');
    // const upscaling = upscaleImage(croppedImg.url, croppedImg.name, requestId); logger(i + '_crop write done');
    const product = await createProduct({
      title: doc.initialPrompt,
      description: prompt,
      img: croppedImg.tShirtBuffer.toString('base64'),
      skuId: requestId + i,
    }); logger(i + 'create shopify product done');

    delete product.variants;
    delete product.options;
    console.log('product id :>> ', product);
    imagesObj[id].generatedImg = croppedImg.url;
    imagesObj[id].productId = product.id.toString();
    imagesObj[id].handle = product.handle;
    serverEvent.trigger(requestId, '1', {
      step: 2,
      images: imagesObj
    });
    const _updateQuery = {
      [`images.${id}.generatedImg`]: croppedImg.url,
      [`images.${id}.productId`]: product.id.toString(),
      [`images.${id}.handle`]: product.handle,
    };
    await imagesCollection.updateOne({ _id: doc._id }, { $set: _updateQuery });
      // .catch(console.error);
    logger(i + 'db doc updated and ready to be displayed', new Date().toISOString());
    // !note! no more upload here in flow "replicate-shopifi-order-printify"
    // const uploading = uploadImage(`ai-${id}.png`, croppedImg.url); logger(i + '_uploadImage waiting...');
    // const uploadToPrintifyRes = await uploading; logger(i + '_uploadImage done');
    // console.log('uploadToPrintifyRes.id :>> ', uploadToPrintifyRes.id);

    // imagesCollection.updateOne({ _id: doc._id }, {
    //   $set: {
    //     [`images.${id}.printifyId`]: uploadToPrintifyRes.id
    //   }
    // }, { upsert: true }).catch(console.error);

    // await upscaling;
    // console.timeLog(logId, i + '_upscaling done');
  });

  Promise.all(promises).then(() => {
    logger(TimeLogger.END);
  }).catch(error => {
    console.error(error);
    logger(TimeLogger.END, error);
  });

  res.status(200).send({});
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
