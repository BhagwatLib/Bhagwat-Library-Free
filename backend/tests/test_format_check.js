'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in env.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const collection = db.collection('students');

  console.log('Querying mock_student_format_id...');
  const doc = await collection.findOne({ _id: 'mock_student_format_id' });

  if (!doc) {
    console.error('Mock student document not found in MongoDB!');
    process.exit(1);
  }

  console.log('\n--- MongoDB Mirror Record Types Verification ---');
  console.log(`Document ID: ${doc._id}`);
  console.log(`Name:        ${doc.name} (type: ${typeof doc.name})`);
  console.log(`Phone:       ${doc.phone} (type: ${typeof doc.phone})`);
  console.log(`Paid Amount: ${doc.paidAmount} (type: ${typeof doc.paidAmount})`);
  console.log(`Seat Number: ${doc.seatNumber} (type: ${typeof doc.seatNumber})`);
  
  console.log(`CreatedAt:   ${doc.createdAt} (type: ${doc.createdAt instanceof Date ? 'BSON Date' : typeof doc.createdAt})`);
  console.log(`UpdatedAt:   ${doc.updatedAt} (type: ${doc.updatedAt instanceof Date ? 'BSON Date' : typeof doc.updatedAt})`);
  console.log(`ValidityTo:  ${doc.validityTo} (type: ${doc.validityTo instanceof Date ? 'BSON Date' : typeof doc.validityTo})`);
  console.log(`ValidityFrom:${doc.validityFrom} (type: ${doc.validityFrom instanceof Date ? 'BSON Date' : typeof doc.validityFrom})`);
  console.log(`AdmissionD:  ${doc.admissionDate} (type: ${doc.admissionDate instanceof Date ? 'BSON Date' : typeof doc.admissionDate})`);
  
  console.log('\nFull Document Object:');
  console.log(JSON.stringify(doc, null, 2));

  // Clean up test document
  console.log('\nCleaning up mock record...');
  await collection.deleteOne({ _id: 'mock_student_format_id' });
  
  await mongoose.disconnect();
  console.log('Done!');
}

run().catch(console.error);
