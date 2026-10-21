import type {NextConfig} from "next";
const config: NextConfig={cacheComponents:true,devIndicators:false,partialPrefetching:true,turbopack:{root:process.cwd(),rules:{"*.css":{loaders:["@tailwindcss/turbopack"],as:"*.css"}}}};
export default config;
