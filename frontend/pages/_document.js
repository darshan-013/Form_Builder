import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Google Fonts — Outfit for headers, Inter for body */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Butterup Toast — async load so window.butterup is ready as early as possible */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/butterup@1.0.7/dist/butterup.css"
        />
        <script
          src="https://cdn.jsdelivr.net/npm/butterup@1.0.7/dist/butterup.js"
          async
        ></script>

      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
