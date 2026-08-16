import 'dotenv/config';
import fm from 'front-matter';
import { createClient } from '@supabase/supabase-js';
import slugs from './slug.js';
import { generateVector } from './embedding.js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const parseExpoDocs = async (slug) => {
  // Mirror URLs to handle ISP blocks or CDN downtime
  const mirrors = [
    `https://cdn.jsdelivr.net/gh/expo/expo@main/docs/pages/${slug}.mdx`,
    `https://raw.githubusercontent.com/expo/expo/main/docs/pages/${slug}.mdx`,
    `https://fastly.jsdelivr.net/gh/expo/expo@main/docs/pages/${slug}.mdx`
  ];

  let lastError;
  for (const url of mirrors) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        return fm(content);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Failed to fetch doc from all mirrors: ${lastError?.message || 'Network error'}`);
};

const handleDoc = async (slug) => {
  try {
    const cleanSlug = slug.replace(/\/$/, '');
    console.log(`\n📄 Processing Expo doc: ${cleanSlug}...`);
    const data = await parseExpoDocs(cleanSlug);

    const vector = generateVector(data.body, 384);

    const { data: insertedData, error } = await supabase
      .from('docs')
      .upsert([
        {
          id: cleanSlug,
          title: data.attributes?.title || cleanSlug,
          url: `https://docs.expo.dev/${cleanSlug}`,
          vector
        }
      ])
      .select();

    if (error) {
      console.error(`❌ Supabase Error (${cleanSlug}):`, error.message);
    } else {
      console.log(`✅ Saved to Supabase: ${cleanSlug} ("${data.attributes?.title || cleanSlug}")`);
    }
  } catch (error) {
    console.error(`❌ Error (${slug}):`, error.message);
  }
};

const handleAllDocs = async () => {
  const targetSlugs = process.argv[2] ? [process.argv[2]] : slugs;
  console.log(`\n🚀 Batch processing ${targetSlugs.length} Expo doc page(s)...`);

  for (const slug of targetSlugs) {
    await handleDoc(slug);
    // Pause briefly between requests to prevent ISP / rate-limit connection resets
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\n🎉 All documentation pages processed and saved to Supabase!");
};

handleAllDocs();
