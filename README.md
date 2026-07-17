# GameGuide Guru

Prototipe companion game mobile-first yang mencari walkthrough di web dengan
Tavily, lalu merangkum langkah yang relevan menggunakan model AI di Replicate.

## Menjalankan aplikasi

Persyaratan: Node.js 20.9 atau lebih baru.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Isi `.env.local` dengan kredensial asli:

```dotenv
TAVILY_API_KEY=tvly-...
REPLICATE_API_TOKEN=r8_...
REPLICATE_MODEL=meta/meta-llama-3-8b-instruct
```

`REPLICATE_MODEL` opsional dan dapat diganti dengan model publik Replicate lain
dalam format `owner/name`.

Buka [http://localhost:3000](http://localhost:3000), masukkan kendala dalam
game, lalu pilih **Temukan jalan keluar**.

## Alur

1. Browser mengirim pertanyaan ke `POST /api/solve`.
2. Route server mencari hingga lima sumber melalui Tavily.
3. Cuplikan hasil pencarian dikirim ke Replicate sebagai konteks.
4. Browser menerima ringkasan dan tautan sumber terpisah.

API key hanya digunakan di server dan tidak dikirim ke browser. Teks sumber
diperlakukan sebagai input tidak tepercaya; model diperintahkan untuk tidak
mengikuti instruksi dari cuplikan web.

## Perintah

- `npm run dev` — development server
- `npm run build` — production build
- `npm start` — menjalankan production build
- `npm run check` — self-check kecil untuk prompt builder
