import fs from 'fs';
import path from 'path';
import prompts from 'prompts';

import { fileURLToPath } from 'url';
import { CollectionsWrite } from '@tbd54566975/dwn-sdk-js';
import { resolve } from '@decentralized-identity/ion-tools';

// __filename and __dirname are not defined in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const didState = fs.readFileSync(`${__dirname}/did-state.json`, { encoding: 'utf8' });
const bob = JSON.parse(didState);

const questions = [{
  type: 'text',
  name: 'recipient',
  message: 'who do you want to message?'
}, {
  type: 'text',
  name: 'messageText',
  message: 'What do you want to say?'
}];


const { recipient, messageText } = await prompts(questions, { onCancel: () => process.exit(0) });
let dwnHosts = [];

try {
  const { didDocument } = await resolve(recipient);

  const { service = [] } = didDocument;

  for (const svc of service) {
    if (svc.type === 'DecentralizedWebNode') {
      dwnHosts = svc.serviceEndpoint.nodes;
      break;
    }
  }

  if (dwnHosts.length === 0) {
    console.error(`recipient does not have any DWNs listed in their DID Document`);
    console.error(JSON.stringify(didDocument, null, 2));
    process.exit(1);
  }
} catch (error) {
  console.error(`Failed to resolve recipient DID: ${recipient}. Error: ${error.message}`);
  process.exit(1);
}

// TODO: handle multiple dwn hosts. send to all? send to at least 1 successfully?
const [dwnHost] = dwnHosts;
console.log(`${dwnHost}/dwn`);

const thread = await createThread('Randy');
await createChatMessage(recipient, thread, messageText);

async function createThread(subject) {
  const savedThreadPath = `${__dirname}/thread.json`;

  if (fs.existsSync(savedThreadPath)) {
    const savedThreadStringified = fs.readFileSync(savedThreadPath, { encoding: 'utf-8' });
    return JSON.parse(savedThreadStringified);
  }

  const encoder = new TextEncoder();
  const thread = {
    subject: subject
  };

  const threadStringified = JSON.stringify(thread);
  const threadBytes = encoder.encode(threadStringified);

  const threadMessage = await CollectionsWrite.create({
    data: threadBytes,
    dataFormat: 'application/json',
    recipient,
    target: recipient,
    protocol: 'chat',
    schema: 'chat/thread',
    signatureInput: bob.signatureMaterial,
  });

  const threadMessageJson = threadMessage.toJSON();
  console.log(JSON.stringify(threadMessageJson, null, 2));

  fs.writeFileSync(savedThreadPath, JSON.stringify(threadMessageJson), { encoding: 'utf-8' });

  try {
    const response = await fetch(`${dwnHost}/dwn`, {
      method: 'POST',
      body: JSON.stringify(threadMessageJson)
    });

    const responseBody = await response.json();

    console.log(`send thread message result: ${JSON.stringify(responseBody, null, 4)}`);

    return threadMessageJson;
  } catch (error) {
    console.error(`Failed to send message to recipient. Error: ${error.message}`);
    process.exit(1);
  }
}

async function createChatMessage(recipient, thread, messageText) {
  const encoder = new TextEncoder();

  const directMessage = {
    text: messageText
  };

  const directMessageStringified = JSON.stringify(directMessage);
  const directMessageBytes = encoder.encode(directMessageStringified);

  // oof. yikes variable name.
  const directMessageMessage = await CollectionsWrite.create({
    data: directMessageBytes,
    dataFormat: 'application/json',
    recipient,
    target: recipient,
    protocol: 'chat',
    contextId: thread.contextId,
    parentId: thread.recordId,
    schema: 'chat/message',
    signatureInput: bob.signatureMaterial,
  });

  console.log(directMessageMessage.toJSON());


  try {
    const response = await fetch(`${dwnHost}/dwn`, {
      method: 'POST',
      body: JSON.stringify(directMessageMessage.toJSON())
    });

    const responseBody = await response.json();

    console.log(`send message result: ${JSON.stringify(responseBody, null, 4)}`);
  } catch (error) {
    console.error(`Failed to send message to recipient. Error: ${error.message}`);
    process.exit(1);
  }
}