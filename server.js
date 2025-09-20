require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const twilio = require("twilio");
const axios = require("axios");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 1. Greeting when call comes in
app.post("/incoming", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: "/process",
    method: "POST",
    speechTimeout: "auto",
  });

  gather.say(
    {
      voice: "Polly.Matthew", // natural voice
      language: "en-US",
    },
    `Hello, thank you for calling TaxNYS. 
     If you'd like to schedule an appointment, say "appointment".
     For tax or accounting questions, please ask after the beep.`
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// 2. Handle caller input
app.post("/process", async (req, res) => {
  const speech = req.body.SpeechResult || "";
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Send to OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are the receptionist for TaxNYS, a tax advisory firm. 
          - If caller asks a tax/accounting question → answer politely in 2–3 sentences.
          - If caller wants an appointment → ask their name, email, phone, and preferred time. 
          - Return structured JSON when you have appointment info: {"intent":"schedule","name":"","email":"","phone":"","time":""}.
          - Always be polite and professional.`,
        },
        { role: "user", content: speech },
      ],
    });

    const reply = completion.choices[0].message.content;

    // If AI responded with JSON → send to Zapier
    if (reply.includes('"intent":"schedule"')) {
      try {
        await axios.post(process.env.ZAPIER_WEBHOOK_URL, JSON.parse(reply));
        twiml.say(
          { voice: "Polly.Matthew", language: "en-US" },
          "Your appointment request has been sent. You will receive confirmation soon. Thank you."
        );
      } catch (err) {
        console.error("Zapier error:", err.message);
        twiml.say(
          { voice: "Polly.Matthew", language: "en-US" },
          "Sorry, there was an error scheduling your appointment. Please try again later."
        );
      }
    } else {
      // Normal tax/accounting answer
      twiml.say({ voice: "Polly.Matthew", language: "en-US" }, reply);
    }
  } catch (err) {
    console.error("AI error:", err.message);
    twiml.say(
      { voice: "Polly.Matthew", language: "en-US" },
      "Sorry, an error occurred. Goodbye."
    );
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// 3. Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TaxNYS AI Receptionist running on port ${PORT}`);
});
