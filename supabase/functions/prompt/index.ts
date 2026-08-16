import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import generateVector from "./embedding.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

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
        // Simple front-matter parsing for Deno
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

const generateLLMResponse = async (userQuery: string, docContext: { title: string; url: string; body: string }, modelName = "gemini-3.5-flash") => {
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
  } catch (err: any) {
    return `❌ Gemini API Error: ${err.message}`;
  }
};

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    try {
      const { query, model = "gemini-3.5-flash" } = await req.json();

      if (!query || typeof query !== "string") {
        return Response.json({ error: "Please provide a valid query string" }, { status: 400 });
      }

      // 1. Generate 384-dimensional embedding for query
      const vector = generateVector(query, 384);

      let bestMatch: any = null;

      // 2. Try match_docs RPC
      const { data: rpcData, error: rpcError } = await ctx.supabaseAdmin.rpc("match_docs", {
        query_embedding: vector,
        match_threshold: 0.0,
        match_count: 1
      });

      if (!rpcError && rpcData && rpcData.length > 0) {
        bestMatch = rpcData[0];
      } else {
        // Fallback: client-side cosine similarity on docs table
        const { data: docs } = await ctx.supabaseAdmin.from("docs").select("id, title, url, vector");
        if (docs && docs.length > 0) {
          const results = docs.map((doc: any) => {
            const docVector = typeof doc.vector === "string" ? JSON.parse(doc.vector) : doc.vector;
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
          results.sort((a: any, b: any) => b.similarity - a.similarity);
          bestMatch = results[0];
        }
      }

      if (!bestMatch) {
        return Response.json({ error: "No matching documentation found in database." }, { status: 404 });
      }

      // 3. Fetch full doc context
      const docData = await parseExpoDocs(bestMatch.id);
      const docBody = docData?.body || bestMatch.title;

      // 4. Generate AI response
      const answer = await generateLLMResponse(
        query,
        {
          title: bestMatch.title,
          url: bestMatch.url,
          body: docBody
        },
        model
      );

      return Response.json({
        answer,
        source: {
          title: bestMatch.title,
          url: bestMatch.url,
          similarity: bestMatch.similarity
        },
        query
      });
    } catch (err: any) {
      return Response.json({ error: err.message || "Internal server error" }, { status: 500 });
    }
  }),
};
