/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Настройки для @xenova/transformers
    config.resolve.alias = {
      ...config.resolve.alias,
      'sharp$': false,
      'onnxruntime-node$': false,
    };
    
    // Для работы с WASM в Transformers.js
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    return config;
  },
  // Увеличиваем таймаут для API routes (индексация может занять время)
  experimental: {
    serverComponentsExternalPackages: ['@xenova/transformers'],
  },
};

module.exports = nextConfig;
