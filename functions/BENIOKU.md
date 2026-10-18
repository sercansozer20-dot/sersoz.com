# E-posta bildirimleri: kurulum

Bu fonksiyonlar adminlere (ve yanıt gelince soruyu sorana) e-posta gönderir. Gönderimi
Firebase'in **Trigger Email** eklentisi yapar; fonksiyonlar yalnız `mail` koleksiyonuna yazar.

## 1. Blaze planı
Firebase Konsolu → sol alttaki plan → **Blaze** (kullanım kadar öde). Az kullanımda ücret çıkmaz.
Fotoğraf yükleme (Storage) için de gerekiyor.

## 2. Gmail uygulama şifresi
Bildirimi gönderecek Gmail hesabında (ör. sercansozer20@gmail.com):
Google Hesabı → Güvenlik → 2 adımlı doğrulama açık olmalı → **Uygulama şifreleri** → yeni şifre oluştur (16 haneli).

## 3. Trigger Email eklentisi
Firebase Konsolu → Extensions → **Trigger Email from Firestore** → Install:
- Email documents collection: `mail`
- SMTP connection URI: `smtps://sercansozer20@gmail.com@smtp.gmail.com:465`
- SMTP password: 2. adımdaki uygulama şifresi
- Default FROM: `Elif'in Dolabı <sercansozer20@gmail.com>`

## 4. Fonksiyonları yükle
Bilgisayarda bir kez:
```
npm install -g firebase-tools
firebase login
```
Sonra `sersoz-site` klasöründe:
```
cd functions && npm install && cd ..
firebase deploy --only functions
```
Aynı klasörden kuralları da tek komutla yükleyebilirsiniz:
```
firebase deploy --only firestore:rules,storage
```

Konum hatası alırsanız (`location ... does not match`) `functions/index.js` içindeki
`BOLGE` değerini Firestore'un konumuna uygun bir bölgeyle değiştirin.
