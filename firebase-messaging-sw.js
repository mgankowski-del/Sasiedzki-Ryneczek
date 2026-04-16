importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyD_cuGXokb55W6W4aB-QkV0c_jAqXkJQgk",
    authDomain: "sasiedzki-ryneczek.firebaseapp.com",
    projectId: "sasiedzki-ryneczek",
    storageBucket: "sasiedzki-ryneczek.firebasestorage.app",
    messagingSenderId: "885991041208",
    appId: "1:885991041208:web:3df60bebb747b563f86c4d"
});

const messaging = firebase.messaging();

// Obsługa powiadomień, gdy aplikacja jest w tle (zamknięta)
messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Odebrano wiadomość w tle: ', payload);
    const notificationTitle = payload.notification.title || "Nowe zamówienie!";
    const notificationOptions = {
        body: payload.notification.body || "Ktoś zarezerwował Twój produkt.",
        icon: '/apple-touch-icon.png' // Twoje logo
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});