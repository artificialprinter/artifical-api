import { MongoClient } from 'mongodb';
 
  // DB access
  // uoEvFxvzRoQtzQac
  // sequence-ai
  
const uri = 'mongodb+srv://sequence-ai:uoEvFxvzRoQtzQac@cluster0.l85oulx.mongodb.net/?retryWrites=true&w=majority';
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
 
await client.connect();
 
const db = client.db('sequence');
 
export const imagesCollection = db.collection('ai-images');
export default db;