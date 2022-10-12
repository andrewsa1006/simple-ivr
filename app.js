// General imports
require("dotenv").config();
const cors = require("cors");
const AWS = require("aws-sdk");
const express = require("express");
const { Voice } = require("@signalwire/realtime-api");

const app = express();
app.use(express.json());
app.use(cors());

// Instantiating and configuring SES
AWS.config.update({ region: "us-east-1" });
const SES = new AWS.SES();

const { PROJECT_ID, API_KEY, SOURCE_ARN } = process.env;

const client = new Voice.Client({
  project: PROJECT_ID,
  token: API_KEY,
  contexts: ["office"],
});

// Create parameters for SES to send email when hosted on AWS.
const generateParamsForSES = (call, recording) => {
  let params = {
    Destination: {
      ToAddresses: ["andrewsa1006@gmail.com"],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: `
          <html>
            <head></head>
            <body>
              <h4>Hey Andrew,</h4>
              <h5>You recieved a call from ${call.from}. They left you this <a href="${recording.url}">voicemail</a>.</h5>
              <br>
              <br>
              <p>This is an automated message sent from an unmonitored mailbox. Please do not respond.</p>
             </body>
          </html>`,
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `Voicemail Notification`,
      },
    },
    Source: "andrewsiftco@gmail.com",
    SourceArn: SOURCE_ARN,
  };

  return params;
};

const playPromptList = async (call) => {
  const promptList = await call.promptTTS({
    text: `Press 1 to hear Andrew's hours of operation.
           Press 2 to send Andrew a voice message.
           Press 9 to hear these options again.
           Press 0 if done, or hang up to disconnect the call.`,
    digits: {
      max: 1,
      digitTimeout: 15,
    },
  });
  let { digits } = await promptList.waitForResult();
  handleUserInput(digits, call);
};

const handleUserInput = async (digits, call) => {
  switch (digits) {
    case "1":
      await call.playTTS({
        text: `Andrew's current hours of operation are from 8 AM, to just after 9AM. If you need to reach him outside of these hours, please hang up and call again later.`,
      });
      break;

    case "2":
      await call.playTTS({
        text: `Please record your message after the tone. When you are finished, you may hang up.`,
      });
      setTimeout(async () => {
        const recording = await call.recordAudio({ beep: true, terminators: "0" });
        await call.waitFor("ended");
        SES.sendEmail(generateParamsForSES(call, recording), (err, data) => {
          if (err) console.log(err, err.stack); // an error occurred
          else console.log(data); // successful response
        });
      }, 7000);
      break;

    case "9":
      playPromptList(call);
      break;

    case "0":
      call.hangup();
      break;

    default:
      playPromptList(call);
      break;
  }
};

// Main entrypoint to application
const main = async () => {
  client.on("call.received", async (call) => {
    try {
      await call.answer();
      let answeringService = await call.playTTS({
        text: "Hello. Thank you for calling Andrew Atwood Limited. Please listen carefully, as the following prompt contains new options.",
      });
      await answeringService.waitForEnded();
      playPromptList(call);
    } catch (error) {
      console.error("Error answering inbound call", error);
    }
  });
};

main();

app.listen(3000, () => {
  console.log("Application running on port 3000");
});
