import * as pdfjs  from 'pdfjs-dist/es5/build/pdf.js';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

async function pdfToText(path) {
	const pdf = await pdfjs.getDocument(path).promise;
	let complete = 0;
	let total = pdf.numPages;
	let pages = {};
	for (let pagei = 1; pagei <= total; pagei++) {
		const page = await pdf.getPage(pagei);
		let pageNumber = page.pageNumber;
		const textContent = await page.getTextContent();
		if (null != textContent.items) {
			let page_text = "";
			let last_item = null;
			for (let itemsi = 0; itemsi < textContent.items.length; itemsi++) {
				let item = textContent.items[itemsi];
				if (last_item != null && last_item.str[last_item.str.length - 1] != ' ') {
					let itemX = item.transform[5]
					let lastItemX = last_item.transform[5]
					let itemY = item.transform[4]
					let lastItemY = last_item.transform[4]
					if (itemX < lastItemX)
						page_text += "\r\n";
					else if (itemY != lastItemY && (last_item.str.match(/^(\s?[a-zA-Z])$|^(.+\s[a-zA-Z])$/) == null))
						page_text += ' ';
				}

				page_text += item.str;
				last_item = item;
			}
			pages[pageNumber] = page_text + "\n\n";
		}
		++complete;
		if (complete == total) {
			let full_text = "";
			let num_pages = Object.keys(pages).length;
			for (let pageNum = 1; pageNum <= num_pages; pageNum++)
				full_text += pages[pageNum];
			return full_text;
		}
	}
	return '';
}

export { pdfToText };