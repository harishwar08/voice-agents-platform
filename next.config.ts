import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only badge sits bottom-left by default, on top of the sidebar's name and Sign out.
  devIndicators: { position: "bottom-right" },
  // Embeddings come from the Hugging Face API (HUGGINGFACE_API_KEY). The local ONNX model
  // is only a fallback, and its packages (~275 MB) would push serverless functions past
  // Vercel's 250 MB limit, so they are left out of deployments; without them the fallback
  // degrades to a hash vector instead of failing (see src/lib/rag/embeddings.ts).
  outputFileTracingExcludes: {
    "/*": [
      "node_modules/@xenova/transformers/**",
      "node_modules/onnxruntime-node/**",
      "node_modules/onnxruntime-web/**",
    ],
  },
};

export default nextConfig;
