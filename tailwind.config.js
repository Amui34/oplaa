/** Compilation locale de Tailwind (plus de CDN → rendu instantané + hors-ligne) */
module.exports = {
  content: ['./www/**/*.html'],
  theme: {
    extend: {
      colors: {
        // Couleur principale pilotée par variables CSS (modifiable par l'admin)
        teal: { 50:'var(--o-50)',100:'var(--o-100)',200:'var(--o-200)',300:'var(--o-300)',400:'var(--o-400)',500:'var(--o-500)',600:'var(--o-600)',700:'var(--o-700)',800:'var(--o-800)',900:'var(--o-900)' },
        slate:{ 50:'var(--s-50)',100:'var(--s-100)',200:'var(--s-200)',300:'var(--s-300)',400:'var(--s-400)',500:'var(--s-500)',600:'var(--s-600)',700:'var(--s-700)',800:'var(--s-800)',900:'var(--s-900)' },
        emerald:{ 50:'#EAF0E8',100:'#EAF0E8',200:'#CFE0CB',300:'#A9C5A2',600:'#3F6B4A',700:'#3F6B4A',800:'#2F5238' },
        red:{ 50:'#F8E6E3',100:'#F8E6E3',200:'#F0CFC9',300:'#E0A9A1',400:'#C86A63',500:'#9E2B2B',600:'#9E2B2B',700:'#9E2B2B',800:'#7F2121' },
        amber:{ 50:'#F7EEDA',100:'#F7EEDA',200:'#EFDDB4',300:'#E4C577',400:'#CBA23F',500:'#A9821F',600:'#8A6516',700:'#8A6516',800:'#6F5012' },
      },
    },
  },
};
