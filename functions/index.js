const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

// Funkcja reaguje na każdą zmianę w dokumentach kolekcji "listings"
exports.notifyneworder = onDocumentUpdated("listings/{listingId}", async (event) => {
    // Dane po zmianie
    const newData = event.data.after.data();
    // Dane przed zmianą
    const oldData = event.data.before.data();

    // Wyciągamy listy rezerwacji (jeśli nie istnieją, dajemy pustą tablicę)
    const newRes = newData.reservations || [];
    const oldRes = oldData.reservations || [];

    // Sprawdzamy, czy przybyła nowa rezerwacja (liczba elementów w tablicy wzrosła)
    if (newRes.length > oldRes.length) {
        const lastOrder = newRes[newRes.length - 1];
        const token = newData.sellerToken;

        // Jeśli sprzedawca nie ma zapisanego tokena (np. nie wyraził zgody na powiadomienia), kończymy
        if (!token) {
            console.log("Sprzedawca nie posiada zapisanego tokena FCM.");
            return;
        }

        const message = {
            token: token,
            notification: {
                title: "Nowe zamówienie! 🛒",
                body: `${lastOrder.buyerName} właśnie złożył zamówienie u Ciebie. Sprawdź szczegóły!`
            },
            webpush: {
                fcmOptions: {
                    // Pamiętaj, aby ten link kierował do Twojej strony na GitHubie
                    link: "https://mgankowski-del.github.io/Sasiedzki-Ryneczek/"
                }
            }
        };

        try {
            await admin.messaging().send(message);
            console.log("Powiadomienie zostało wysłane pomyślnie!");
        } catch (error) {
            console.error("Błąd podczas wysyłania powiadomienia:", error);
        }
    }
});