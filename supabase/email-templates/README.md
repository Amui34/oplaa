# Modèles d'e-mails Supabase (Oplaa)

Source de vérité des e-mails d'authentification. À coller dans le dashboard Supabase :
Authentication → Emails → (modèle) → onglet **Source**, puis **Save changes**.

| Modèle Supabase | Fichier | Objet (Subject) |
|---|---|---|
| Confirm sign up (`confirm-sign-up`) | `confirm-signup.html` | `Confirme ton compte Oplaa (code {{ .Token }})` |
| Reset password (`reset-password`) | `reset-password.html` | `{{ .Token }} — ton code pour changer de mot de passe Oplaa` |

Expéditeur : réglé dans Authentication → Emails → SMTP Settings (Resend, domaine oplaa.pro).
Variables utilisées : `{{ .Token }}` (code à 6 chiffres saisi dans l'app : `verifyOtp` type `signup` / `recovery`) et `{{ .ConfirmationURL }}` (lien de secours). Le logo est servi par https://oplaa.pro/icon-192.png.
Les liens renvoient vers la Site URL (`https://oplaa.pro`) — voir Authentication → URL Configuration.

Le mail de confirmation propose **les deux méthodes** : bouton « Confirmer mon adresse » (seule méthode connue des versions iOS ≤ 1.0.9, qui n'ont pas d'écran de saisie de code) et code à 6 chiffres (app ≥ 1.0.10 et web). Ne pas retirer le bouton tant que des 1.0.9 sont en circulation.
