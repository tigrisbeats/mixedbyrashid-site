// Existing Tigris Beats LLC Payment Links. Their paid Checkout Sessions carry
// service metadata and return to the same site after Stripe confirms payment.
const studioLinks = {
  2: 'https://book.stripe.com/5kQ28sbSx5u85qX1GC4wM03',
  3: 'https://book.stripe.com/00w6oIaOtf4I6v1dpk4wM04',
  4: 'https://book.stripe.com/bJeaEY7Chg8MaLhfxs4wM05',
  5: 'https://book.stripe.com/3cI14oe0Ff4IdXt0Cy4wM06',
  6: 'https://book.stripe.com/dRm6oI4q5aOs5qX3OK4wM07',
  7: 'https://book.stripe.com/00wbJ2bSx1dS7z5clg4wM08',
  8: 'https://book.stripe.com/aFa14o9Kpe0E8D90Cy4wM09',
  9: 'https://book.stripe.com/14A7sMg8N5u8f1xclg4wM0a',
  10: 'https://book.stripe.com/4gMeVecWB8GkcTpeto4wM0b',
  11: 'https://book.stripe.com/5kQcN6e0F2hW8D9clg4wM0c',
  12: 'https://book.stripe.com/4gM28s6yde0E06D0Cy4wM0d',
};
const audioLinks = {
  mixing: 'https://buy.stripe.com/4gM6oI5u91dS1aH0Cy4wM01',
  mastering: 'https://buy.stripe.com/00waEY6ydcWA2eLclg4wM02',
};

export function livePaymentLink(service, hours, email) {
  const base = service === 'studio' ? studioLinks[hours] : audioLinks[service];
  if (!base) return null;
  const url = new URL(base);
  if (email) url.searchParams.set('prefilled_email', email);
  return url.href;
}
