# Panduan Backup Database Supabase (Untuk Pemula)

Dokumen ini adalah catatan langkah demi langkah untuk mem-backup struktur (tabel, kolom, RLS) dari database Supabase awan Anda ke komputer lokal. Semua proses ini dilakukan melalui Terminal.

## 🛠 Persiapan Wajib
Sebelum memulai proses apapun, pastikan **Docker Desktop** sudah ter-install dan berjalan di MacBook Anda.
1. Buka aplikasi **Docker Desktop**.
2. Tunggu sampai tulisan di pojok kiri bawah berwarna hijau dan berbunyi **"Engine running"** (Icon Paus di menu atas Mac berhenti berkedip).

---

## 🚀 Cara Backup Pertama Kali (Atau Jika Pindah Komputer)

### 1. Bersihkan Sisa Login Lama
Untuk menghindari error salah akun, selalu bersihkan sesi lama di terminal terlebih dahulu:
```bash
npx supabase logout
unset SUPABASE_ACCESS_TOKEN
```

### 2. Dapatkan Kunci Master (Personal Access Token)
Jangan gunakan perintah login otomatis (`npx supabase login`) karena sering menyebabkan *bug* "Unauthorized" jika Anda memiliki banyak akun. Gunakan cara manual:
1. Buka browser dan pergi ke: [https://supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
2. Pastikan Anda login dengan akun email/Github yang benar (akun pemilik asli proyek ini).
3. Klik **"Generate new token"**, beri nama (misal: "Terminal Mac"), dan **Copy** teks panjang yang muncul.
4. Buka terminal dan jalankan perintah ini (ganti tulisan `<PASTE_TOKEN_DISINI>` dengan token yang Anda *copy*):
```bash
npx supabase login --token <PASTE_TOKEN_DISINI>
```

### 3. Hubungkan Terminal ke Proyek
Ketik perintah di bawah ini untuk mengunci radar terminal tepat pada proyek Supabase Anda:
```bash
npx supabase link --project-ref luoymycbpnvamdtlzjem
```
*(Catatan: Anda akan diminta mengetikkan Password Database Anda. Ketik saja passwordnya, teks memang sengaja tidak terlihat saat diketik, lalu tekan Enter).*

### 4. Sedot Database (Pull)
Jalankan perintah pamungkas untuk menyedot *database* awan ke lokal:
```bash
npx supabase db pull
```
- Tunggu proses *download* selesai.
- Jika di akhir proses terminal bertanya *"Update remote migration history table? [Y/n]"*, ketik **Y** lalu **Enter**.
- Selesai! Kode SQL *backup* Anda sekarang aman di dalam folder `supabase/migrations/`.

---

## 🔄 Cara Update Backup (Rutinitas Sehari-hari)

Jika Anda menambah tabel baru, menghapus tabel, mengubah nama kolom, atau mengganti rules RLS **melalui Dashboard Supabase di browser**, Anda **wajib** mengupdate *backup* lokal agar tidak tertinggal.

Rutinitasnya sangat mudah:
1. Nyalakan **Docker Desktop**.
2. Buka terminal dan jalankan:
```bash
npx supabase db pull
```
3. Jika ditanya update history, tekan **Y (Enter)**.
Selesai! Supabase secara otomatis akan membuat 1 file `.sql` baru yang khusus berisi perubahan terakhir Anda tanpa merusak data lama.

---

## 🚑 Troubleshooting (Kamus Penyelamat Error)

### Error 1: "Cannot connect to the Docker daemon... Is the docker daemon running?"
- **Penyebab:** Aplikasi Docker sedang dalam keadaan mati/belum dinyalakan.
- **Solusi:** Buka aplikasi Docker Desktop lewat Launchpad, tunggu sampai berstatus "Engine running", lalu ulangi perintah `npx supabase db pull`.

### Error 2: "Authorization failed... Unauthorized"
- **Penyebab:** Terminal Anda masih mengantongi ID/Token dari akun Supabase Anda yang lain (misal akun pribadi), bukan akun yang mengelola proyek ini.
- **Solusi:** 
  1. Jalankan `unset SUPABASE_ACCESS_TOKEN` di terminal.
  2. Buka Dashboard Supabase di *browser*, pastikan *logout* dari akun yang salah, dan *login* ke akun yang benar.
  3. Ikuti **Langkah 1 & 2** pada Panduan Backup di atas.

### Error 3: "The remote database's migration history does not match local files"
- **Penyebab:** Database awan bingung karena dia punya catatan *history* perubahan lama, tapi folder lokal `supabase/migrations` di komputer Anda saat ini kosong/berbeda (biasanya terjadi karena proses tarikan pernah gagal di tengah jalan).
- **Solusi:**
  1. Bersihkan *file* sampah/kosong (jika ada) di folder lokal dengan menjalankan:
     ```bash
     rm supabase/migrations/*
     ```
  2. *Copy-paste* rentetan perintah `supabase migration repair --status reverted <angka_panjang>` yang disarankan oleh teks merah di error terminal Anda. Jalankan perintah itu semua untuk me-reset catatan di awan kembali ke 0.
  3. Ulangi perintah `npx supabase db pull`.
