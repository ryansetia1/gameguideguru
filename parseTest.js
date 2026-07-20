const { parseGamefaqsTocFromHtml } = require('./lib/gamefaqs-bundle.js');

const html = `
<a href="?page=0">First Page</a>
<a href="?page=1">Page 2 of 2</a>
<a href="/ps4/186904-risk-of-rain/faqs/71405?page=2">Page 3 of 3</a>
`;
const bundle = { faqId: '71405', canonicalUrl: 'https://gamefaqs.gamespot.com/ps4/186904-risk-of-rain/faqs/71405' };
console.log(parseGamefaqsTocFromHtml(html, bundle));
