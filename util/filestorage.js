import AWS from 'aws-sdk';

const storage = new AWS.S3();

export const write = async (filename, buffer) => {
    await storage.putObject({
        Body: buffer,
        Bucket: process.env.CYCLIC_BUCKET_NAME,
        /*ACL: 'public-read',*/
        ContentType: 'image/png',
        Key: filename,
      }).promise();

      return filename;
};

export const read = async (filename) => {
    try {
        let s3File = await storage.getObject({
          Bucket: process.env.CYCLIC_BUCKET_NAME,
          Key: filename,
        }).promise();
    
        return Buffer.from(s3File.Body); 
      } catch (error) {
        return { error };
      }
};