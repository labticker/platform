import type {NextConfig} from 'next';
const config:NextConfig={
 logging:{incomingRequests:false,serverFunctions:false},
 async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'geolocation=(), camera=(), microphone=()'},{key:'Content-Security-Policy',value:"frame-ancestors 'none'; object-src 'none'; base-uri 'self'"}]},...['/auth/:path*','/api/auth/:path*','/dashboard','/settings','/digests','/api/digests','/admin/:path*','/unsubscribe'].map(source=>({source,headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'private, no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'}]}))];},
 webpack(config){config.resolve.extensionAlias={...config.resolve.extensionAlias,'.js':['.ts','.tsx','.js']};return config;},
};
export default config;
