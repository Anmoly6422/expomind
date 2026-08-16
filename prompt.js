import 'dotenv/config';
import fm from 'front-matter';
import { createClient } from '@supabase/supabase-js';
import generateVector from "./embedding.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Fetch raw Expo documentation MDX content
const parseExpoDocs = async (slug) => {
  const mirrors = [
    `https://cdn.jsdelivr.net/gh/expo/expo@main/docs/pages/${slug}.mdx`,
    `https://raw.githubusercontent.com/expo/expo/main/docs/pages/${slug}.mdx`,
    `https://fastly.jsdelivr.net/gh/expo/expo@main/docs/pages/${slug}.mdx`
  ];

  for (const url of mirrors) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        return fm(content);
      }
    } catch (err) {}
  }
  return null;
};

// Call Gemini API to generate contextual RAG response
const generateLLMResponse = async (userQuery, docContext, modelName = "gemini-3.5-flash") => {
  const systemPrompt = `You are ExpoMind, an expert AI documentation assistant for Expo & React Native.
Answer the user's question accurately using ONLY the official documentation context provided below.

--- DOCUMENTATION CONTEXT ---
Title: ${docContext.title}
URL: ${docContext.url}

${docContext.body}
--- END CONTEXT ---

User Question: ${userQuery}

Instructions:
- Provide a clear, step-by-step response with code blocks if applicable.
- Ground your answer strictly on the documentation context above.
- Be concise, practical, and helpful.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      }
    );

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(result, null, 2);
  } catch (err) {
    return `❌ Gemini API Error: ${err.message}`;
  }
};

const runPrompt = async (query, modelName = "gemini-3.5-flash") => {
    console.log(`\n🔍 Query: "${query}"`);
    console.log(`🤖 LLM Model: ${modelName}`);
    
    // 1. Generate vector embedding for user query
    const vector = generateVector(query, 384);
    console.log(`⚡ Query vector generated (384 dimensions)`);

    let bestMatch = null;

    // 2. Search Supabase for closest matching doc
    const { data: rpcData, error: rpcError } = await supabase.rpc('match_docs', {
        query_embedding: vector,
        match_threshold: 0.0,
        match_count: 1
    });

    if (!rpcError && rpcData && rpcData.length > 0) {
        bestMatch = rpcData[0];
    } else {
        // Fallback to client-side cosine search
        const { data: docs } = await supabase.from('docs').select('id, title, url, vector');
        if (docs && docs.length > 0) {
            const results = docs.map(doc => {
                const docVector = typeof doc.vector === 'string' ? JSON.parse(doc.vector) : doc.vector;
                let dotProduct = 0, queryMag = 0, docMag = 0;
                for (let i = 0; i < vector.length; i++) {
                    const qVal = vector[i] || 0;
                    const dVal = docVector[i] || 0;
                    dotProduct += qVal * dVal;
                    queryMag += qVal * qVal;
                    docMag += dVal * dVal;
                }
                const similarity = dotProduct / (Math.sqrt(queryMag) * Math.sqrt(docMag) || 1);
                return { title: doc.title, url: doc.url, id: doc.id, similarity };
            });
            results.sort((a, b) => b.similarity - a.similarity);
            bestMatch = results[0];
        }
    }

    if (!bestMatch) {
        console.error("❌ No matching documentation found in database.");
        return;
    }

    console.log(`\n🎯 Closest Matching Doc: "${bestMatch.title}" (${(bestMatch.similarity * 100).toFixed(1)}% match)`);
    console.log(`🔗 URL: ${bestMatch.url}`);

    // 3. Fetch full doc content for context
    console.log(`📄 Fetching full documentation context...`);
    const docData = await parseExpoDocs(bestMatch.id);

    if (!docData) {
        console.error("❌ Could not fetch documentation body.");
        return;
    }

    // 4. Generate LLM Response with Context
    console.log(`\n⚡ Generating answer with Gemini AI (${modelName})...\n`);
    const aiAnswer = await generateLLMResponse(query, {
        title: bestMatch.title,
        url: bestMatch.url,
        body: docData.body
    }, modelName);

    console.log("==================== EXPOMIND AI RESPONSE ====================");
    console.log(aiAnswer);
    console.log("==============================================================");
    console.log(`\n📚 Source Citation: ${bestMatch.title} (${bestMatch.url})`);
};

// Accept user prompt and model choice from command line:
// Usage: node prompt.js "Your query here" "gemini-3.5-flash"
const userQuery = process.argv[2] || "How to initialize a new expo project";
const selectedModel = process.argv[3] || "gemini-3.5-flash";

runPrompt(userQuery, selectedModel);
