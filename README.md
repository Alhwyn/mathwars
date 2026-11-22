## setup there!!!

1. install Node.js 20 or newer.
2. create a Discord bot application and fill in `DISCORD_TOKEN` and
   `DISCORD_CLIENT_ID`. Add the bot to the intended server.
3. install dependencies and build:

   sh
   npm install
   npm run build
   

4. start the bot:

   sh
   npm start
   

## Vercel

Deploy this repo. Connect a Blob store, and set `DISCORD_PUBLIC_KEY` and `CRON_SECRET` with the other bot variables. Then set the Discord Interactions Endpoint URL to `https://<your-domain>/api/interactions`. Leave `npm start` off once that URL is saved. The weekly post runs from `/api/weekly` on Sunday at 08:00 UTC.
 
