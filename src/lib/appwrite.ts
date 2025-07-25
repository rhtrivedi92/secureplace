// src/lib/appwrite.ts
import { Client, Account, Databases } from "appwrite";

const client = new Client();

client
  .setEndpoint(import.meta.env.PUBLIC_APPWRITE_ENDPOINT) // Your API Endpoint
  .setProject(import.meta.env.PUBLIC_APPWRITE_PROJECT_ID); // Your project ID

export const account = new Account(client);
export const databases = new Databases(client);

// For simplicity, we directly expose the client instance as well if needed
export const appwriteClient = client;
