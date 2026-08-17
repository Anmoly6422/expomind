import supabase from './supabase';
import { generateVector } from './embedding';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

const parseExpoDocs = async (slug: string) => {
  const cleanSlug = slug.replace(/\/$/, '');
  const mirrors = [
    `https://cdn.jsdelivr.net/gh/expo/expo@main/docs/pages/${cleanSlug}.mdx`,
    `https://raw.githubusercontent.com/expo/expo/main/docs/pages/${cleanSlug}.mdx`,
    `https://fastly.jsdelivr.net/gh/expo/expo@main/docs/pages/${cleanSlug}.mdx`
  ];

  for (const url of mirrors) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        const parts = text.split(/^---$/m);
        const body = parts.length >= 3 ? parts.slice(2).join('---').trim() : text;
        return { body };
      }
    } catch (_err) {
      // Continue to next mirror
    }
  }
  return null;
};

const generateLLMResponse = async (
  userQuery: string,
  docContext: { title: string; url: string; body: string },
  modelName = 'gemini-3.5-flash'
) => {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      }
    );

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(result, null, 2);
  } catch (err: any) {
    return `❌ Gemini API Error: ${err.message}`;
  }
};

export async function askExpoMind(query: string) {
  // 1. Try Supabase Edge Function first
  try {
    const { data, error } = await supabase.functions.invoke('prompt', {
      body: { query },
    });

    if (!error && data?.answer) {
      return { answer: data.answer, source: data.source || null };
    }
  } catch (_edgeError) {
    // Edge function failed or is not deployed, fall through to client RAG
  }

  // 2. Fallback: Client-side vector search and RAG
  const queryVector = generateVector(query, 384);

  // Try RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc('match_docs', {
    query_embedding: JSON.stringify(queryVector) as any,
    match_threshold: 0.0,
    match_count: 1
  });

  let bestMatch: any = null;

  if (!rpcError && rpcData && rpcData.length > 0) {
    bestMatch = rpcData[0];
  } else {
    // Client-side cosine similarity
    const { data: docs, error: docsError } = await supabase
      .from('docs')
      .select('id, title, url, vector');

    if (docsError || !docs || docs.length === 0) {
      throw new Error('Could not fetch documentation from database. Please run node index.js first.');
    }

    const results = docs.map((doc: any) => {
      const docVector = typeof doc.vector === 'string' ? JSON.parse(doc.vector) : doc.vector;
      let dotProduct = 0, queryMag = 0, docMag = 0;
      for (let i = 0; i < queryVector.length; i++) {
        const qVal = queryVector[i] || 0;
        const dVal = docVector[i] || 0;
        dotProduct += qVal * dVal;
        queryMag += qVal * qVal;
        docMag += dVal * dVal;
      }
      const similarity = dotProduct / (Math.sqrt(queryMag) * Math.sqrt(docMag) || 1);
      return { title: doc.title, url: doc.url, id: doc.id, similarity };
    });

    results.sort((a: any, b: any) => b.similarity - a.similarity);
    bestMatch = results[0];
  }

  if (!bestMatch) {
    throw new Error('No matching documentation found in database.');
  }

  // Fetch full doc text
  const docData = await parseExpoDocs(bestMatch.id);
  const docBody = docData?.body || bestMatch.title;

  // Generate answer with Gemini AI
  const answer = await generateLLMResponse(query, {
    title: bestMatch.title,
    url: bestMatch.url,
    body: docBody
  });

  return {
    answer,
    source: {
      title: bestMatch.title,
      url: bestMatch.url,
      similarity: bestMatch.similarity
    }
  };
}
