require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Pool for PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL // Ensure DATABASE_URL is set in your .env file
});

// DALL-E 3 image generation route
app.post('/dall-e-3', async (req, res) => {
    const url = 'https://api.openai.com/v1/images/generations';
    
    // Extract size, n, and quality from the request body, with default values
    const size = req.body.size || "1024x1024";
    const n = req.body.n || 1;
    const quality = req.body.quality || "standard"; // "hd" or "standard", default to "standard"

    const options = {
        method: 'post',
        url: url,
        data: {
            model: "dall-e-3",
            prompt: req.body.prompt,
            n: n, // Use the provided value or default to 1
            size: size, // Use the provided value or default to "1024x1024"
            quality: quality, // Use the provided value or default to "standard"
        },
        headers: {
            'Authorization': `Bearer ${process.env.DALL_E_API_KEY}`, // Use environment variable for API key
            'Content-Type': 'application/json'
        }
    };

    try {
        const apiResponse = await axios(options);
        res.send(apiResponse.data);
    } catch (error) {
        console.error('Error making request to DALL-E 3 API:', error);
        res.status(500).send({ error: 'Failed to fetch data' });
    }
});

// Keywords route for PostgreSQL data fetching
app.get('/keywords', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM keywords');
    res.json(rows);
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(500).send(`Database connection error: ${err.message}`);
  }
});

app.post('/keywords', async (req, res) => {
  const { category, keywords } = req.body; // Extract category and keywords from the request body
  try {
    // Begin a transaction
    await pool.query('BEGIN');

    // Insert keywords associated with the category
    const insertKeywordQuery = 'INSERT INTO keywords (category, word) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT category_word_unique DO NOTHING';
    for (const keyword of keywords) {
      await pool.query(insertKeywordQuery, [category, keyword]);
    }

    // Commit the transaction
    await pool.query('COMMIT');
    res.status(200).send('Keywords added successfully');
  } catch (err) {
    // Rollback in case of error
    await pool.query('ROLLBACK');
    console.error('Error updating database:', err);
    res.status(500).send(`Error updating database: ${err.message}`);
  }
});



// Stable Diffusion text-to-image route
app.post('/text2img', async (req, res) => {
    const stableDiffusionUrl = 'https://stablediffusionapi.com/api/v3/text2img';
    
    const postData = {
        key: process.env.STABLE_DIFFUSION_API_KEY, // Your Stable Diffusion API Key from environment variables
        prompt: req.body.prompt,
        negative_prompt: req.body.negative_prompt,
        width: req.body.width,
        height: req.body.height,
        samples: req.body.samples,
        num_inference_steps: req.body.num_inference_steps,
        seed: req.body.seed, // Pass null to randomize
        guidance_scale: req.body.guidance_scale,
        webhook: req.body.webhook,
        track_id: req.body.track_id
    };

    try {
        const response = await axios.post(stableDiffusionUrl, postData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error making request to Stable Diffusion API:', error);
        res.status(500).send({ error: 'Failed to generate image' });
    }
});

app.post('/text2img2', async (req, res) => {
    const stableDiffusionUrl = 'https://modelslab.com/api/v6/realtime/text2img';
    
    // Adjusting postData to match the new API's expected request body structure
    const postData = {
        key: process.env.STABLE_DIFFUSION_API_KEY, // Your API Key from environment variables
        prompt: req.body.prompt || 'ultra realistic close up portrait ((beautiful pale cyberpunk female with heavy black eyeliner))', // Default prompt
        negative_prompt: req.body.negative_prompt || 'bad quality', // Default negative prompt
        width: req.body.width || 512, // Default width
        height: req.body.height || 512, // Default height
        samples: req.body.samples || 1, // Default number of samples, max 4
        safety_checker: req.body.safety_checker !== undefined ? req.body.safety_checker : false, // Default safety checker
        seed: req.body.seed || null, // Default seed, pass null for random
        guidance_scale: req.body.guidance_scale || 5, // Default guidance scale, min 1, max 5
        webhook: req.body.webhook || null, // Default webhook, null if not used
        track_id: req.body.track_id || null, // Default track_id, null if not used
        instant_response: req.body.instant_response !== undefined ? req.body.instant_response : false, // Default instant response
        base64: req.body.base64 !== undefined ? req.body.base64 : false // Default base64 response
    };

    try {
        const response = await axios.post(stableDiffusionUrl, postData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error making request to ModelsLab API:', error);
        res.status(500).send({ error: 'Failed to generate image' });
    }
});

// Chat Completions API route
app.post('/chat', async (req, res) => {
    const chatCompletionsUrl = 'https://api.openai.com/v1/chat/completions';

    const postData = {
        model: "gpt-4-turbo-preview",
        messages: req.body.messages || [
            {
                "role": "system",
                "content": "You are a helpful assistant."
            },
            {
                "role": "user",
                "content": "Tell me a joke."
            }
        ] // Default messages if none are provided
    };

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DALL_E_API_KEY}` // Use the same .env value as DALL-E 3 API
    };

    try {
        const response = await axios.post(chatCompletionsUrl, postData, { headers });
        res.json(response.data);
    } catch (error) {
        console.error('Error making request to Chat Completions API:', error);
        res.status(500).send({ error: 'Failed to generate text' });
    }
});


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Endpoint to fetch unique categories
app.get('/categories', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT DISTINCT category FROM keywords');
      res.json(rows.map(row => row.category));
    } catch (err) {
      console.error('Error fetching categories:', err);
      res.status(500).send(`Error fetching categories: ${err.message}`);
    }
  });
  