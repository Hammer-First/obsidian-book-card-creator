import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile } from 'obsidian';

interface BookCardCreatorSettings {
	bookTemplatePath: string;
	bookOutputFolder: string;
	blogTemplatePath: string;
	blogOutputFolder: string;
	anthropicApiKey: string;
	llmModel: string;
}

// カードの共通インターフェース
interface CardInfo {
	title: string;
	summary: string;
}

interface BookInfo extends CardInfo {
	author: string;
	genre: string;
	genreUrl: string;
	amazonUrl: string;
}

interface BlogInfo extends CardInfo {
	blogUrl: string;
}

// アプリのデフォルト設定
const DEFAULT_SETTINGS: BookCardCreatorSettings = {
	bookTemplatePath: '',
	bookOutputFolder: '',
	blogTemplatePath: '',
	blogOutputFolder: '',
	anthropicApiKey: '',
	llmModel: 'claude-3-haiku-20240307'
}

// URLパターンの正規表現
const URL_PATTERN = /(https?:\/\/[^\s()<>]+(?:\([\w\d]+\)|([^!\s()<>.,;:'"[\]{}]|\/)))/g;

export default class BookCardCreator extends Plugin {
	settings: BookCardCreatorSettings;

	async onload() {
		console.log('Loading Book Card Creator plugin v1.3.1');
		await this.loadSettings();

		// スタイルシートを読み込む
		this.loadStyles();

		// コマンドパレットにコマンドを追加
		this.addCommand({
			id: 'create-book-card',
			name: 'Create Book Card from Amazon URL',
			callback: () => {
				new BookUrlModal(this.app, this).open();
			}
		});

		// 技術ブログからカードを作成するコマンドを追加
		this.addCommand({
			id: 'create-tech-blog-card',
			name: 'Create Tech Blog Card from URL',
			callback: () => {
				new TechBlogUrlModal(this.app, this).open();
			}
		});

		// カーソル下のURLからカードを作成するコマンドを追加
		this.addCommand({
			id: 'create-card-from-cursor',
			name: 'Create Card from URL under cursor',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				try {
					// カーソル位置のURLを取得
					const url = this.getUrlUnderCursor(editor);
					if (!url) {
						new Notice('No URL found under cursor');
						return;
					}
					
					console.log(`Found URL under cursor: ${url}`);
					
					// URLの種類に基づいて適切なモーダルを開く
					this.openModalForUrl(url);
				} catch (error) {
					console.error('Error processing URL under cursor:', error);
					new Notice(`Error processing URL: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		});

		// 設定タブを追加
		this.addSettingTab(new BookCardCreatorSettingTab(this.app, this));
		
		console.log('Book Card Creator plugin loaded successfully');
	}
	
	/**
	 * URLの種類を検出する
	 * @param url 検査対象のURL
	 * @returns URLの種類 ('amazon' または 'blog')
	 */
	private detectUrlType(url: string): 'amazon' | 'blog' {
		// URLのバリデーション
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			// 完全なURLでない場合はブログとして扱う
			return 'blog';
		}
		
		// Amazonの複数のドメインパターンに対応
		const amazonDomains = [
			'amazon.com', 
			'amazon.co.jp', 
			'amazon.co.uk', 
			'amazon.de', 
			'amazon.fr', 
			'amazon.it', 
			'amazon.es', 
			'amazon.ca', 
			'amazon.in', 
			'amazon.com.au', 
			'amazon.com.br', 
			'amazon.nl', 
			'amazon.com.mx', 
			'amzn.to', // 短縮URL
			'a.co' // 短縮URL
		];
		
		try {
			// URLオブジェクトを作成してドメインを取得
			const urlObj = new URL(url);
			const domain = urlObj.hostname;
			
			// Amazonドメインかどうかをチェック
			for (const amazonDomain of amazonDomains) {
				if (domain.includes(amazonDomain)) {
					return 'amazon';
				}
			}
		} catch (error) {
			// URLの解析に失敗した場合はログに記録
			console.error('Error parsing URL:', error);
		}
		
		// デフォルトはブログとして扱う
		return 'blog';
	}

	// URLに基づいて適切なモーダルを開き、自動処理を開始
	private openModalForUrl(url: string): void {
		let modal: UrlModal;
		
		// URLの種類を検出
		const urlType = this.detectUrlType(url);
		
		// 適切なモーダルを選択
		if (urlType === 'amazon') {
			// Amazonの場合は書籍用モーダル
			modal = new BookUrlModal(this.app, this);
		} else {
			// それ以外はブログ用モーダル
			modal = new TechBlogUrlModal(this.app, this);
		}
		
		// URLを設定してモーダルを表示
		modal.url = url;
		modal.open();
		
		// URLが入力済みなので自動的に処理を開始（少し遅延させる）
		setTimeout(() => {
			modal.startProcessing();
		}, 100);
	}
	
	// プラグインのスタイルシートを読み込む
	loadStyles() {
		// Obsidianのプラグインでスタイルシートを読み込む正しい方法
		// プラグインのマニフェストで指定されたstyles.cssが自動的に読み込まれる
		// このメソッドは将来の拡張のために残しておく
	}

	onunload() {
		console.log('Unloading Book Card Creator plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * ファイルパスからTFileオブジェクトを取得（存在確認）
	 * @param filePath ファイルパス
	 * @returns TFileオブジェクトまたはnull
	 */
	private getTemplateFile(filePath: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		return file instanceof TFile ? file : null;
	}
	
	/**
	 * フォルダパスからTFolderオブジェクトを取得（存在確認）
	 * @param folderPath フォルダパス
	 * @returns TFolderオブジェクトまたはnull
	 */
	private getOutputFolder(folderPath: string): TFolder | null {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		return folder instanceof TFolder ? folder : null;
	}
	
	/**
	 * ファイル名に使用できない文字を除去
	 * @param title ファイル名に使いたいタイトル
	 * @returns 安全なファイル名
	 */
	private sanitizeFilename(title: string): string {
		return title.replace(/[\\/:*?"<>|]/g, '');
	}

	/**
	 * カード情報からテンプレートを使用してノートを作成
	 * @param cardInfo BookInfoかBlogInfoオブジェクト
	 */
	async createNoteFromTemplate(cardInfo: BookInfo | BlogInfo) {
		let templatePath = '';
		let outputFolderPath = '';
		
		// BookInfoかBlogInfoかを判定してテンプレートと出力フォルダを選択
		if (this.isBookInfo(cardInfo)) {
			templatePath = this.settings.bookTemplatePath;
			outputFolderPath = this.settings.bookOutputFolder;
		} else if (this.isBlogInfo(cardInfo)) {
			templatePath = this.settings.blogTemplatePath;
			outputFolderPath = this.settings.blogOutputFolder;
		}
		
		// テンプレートファイルが存在するか確認
		const templateFile = this.getTemplateFile(templatePath);
		if (!templateFile) {
			new Notice('Template file not found. Please check your settings.');
			return;
		}

		// 出力フォルダが存在するか確認
		const outputFolder = this.getOutputFolder(outputFolderPath);
		if (!outputFolder) {
			new Notice('Output folder not found. Please check your settings.');
			return;
		}

		// テンプレートの内容を取得
		const templateContent = await this.app.vault.read(templateFile);

		// テンプレートの内容を置換
		let newContent = templateContent;
		
		// BookInfoかBlogInfoかを判定して適切な置換を行う
		if (this.isBookInfo(cardInfo)) {
			newContent = this.applyBookTemplate(newContent, cardInfo);
		} else if (this.isBlogInfo(cardInfo)) {
			newContent = this.applyBlogTemplate(newContent, cardInfo);
		}

		// ファイル名（タイトルから不正な文字を除去）
		const fileName = `${this.sanitizeFilename(cardInfo.title)}.md`;
		const filePath = `${outputFolderPath}/${fileName}`;

		// 新しいノートを作成
		try {
			await this.app.vault.create(filePath, newContent);
			new Notice(`Card created: ${fileName}`);
			
			// 作成したノートを開く
			const newFile = this.app.vault.getAbstractFileByPath(filePath);
			if (newFile instanceof TFile) {
				this.app.workspace.getLeaf().openFile(newFile);
			}
		} catch (error) {
			new Notice(`Error creating note: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	
	/**
	 * 書籍情報をテンプレートに適用
	 */
	private applyBookTemplate(template: string, book: BookInfo): string {
		let result = template;
		
		// 基本情報を置換
		result = result.replace(/{{book-creator:title}}/g, book.title);
		result = result.replace(/{{book-creator:author}}/g, this.createMarkdownLink(book.author, `${book.author}`));
		result = result.replace(/{{book-creator:genre}}/g, book.genre);
		result = result.replace(/{{book-creator:summary}}/g, book.summary);
		
		// Amazon URLをMarkdownリンクとして挿入
		result = result.replace(/{{book-creator:amazon-link}}/g, 
			this.createMarkdownLink(book.title, book.amazonUrl));
		
		// ジャンルURLのリンクも挿入（ジャンルURLがある場合のみ）
		if (book.genreUrl) {
			result = result.replace(/{{book-creator:genre-link}}/g, 
				this.createMarkdownLink(book.genre, book.genreUrl));
		} else {
			result = result.replace(/{{book-creator:genre-link}}/g, book.genre);
		}
		
		return result;
	}
	
	/**
	 * ブログ情報をテンプレートに適用
	 */
	private applyBlogTemplate(template: string, blog: BlogInfo): string {
		let result = template;
		
		// 基本情報を置換
		result = result.replace(/{{blog-creator:title}}/g, blog.title);
		result = result.replace(/{{blog-creator:summary}}/g, blog.summary);
		
		// Blog URLをMarkdownリンクとして挿入
		result = result.replace(/{{blog-creator:blog-link}}/g, 
			this.createMarkdownLink(blog.title, blog.blogUrl));
		
		return result;
	}
	
	/**
	 * 型ガード: 与えられたオブジェクトがBookInfo型かどうかを判定
	 */
	private isBookInfo(info: BookInfo | BlogInfo): info is BookInfo {
		return 'amazonUrl' in info;
	}
	
	/**
	 * 型ガード: 与えられたオブジェクトがBlogInfo型かどうかを判定
	 */
	private isBlogInfo(info: BookInfo | BlogInfo): info is BlogInfo {
		return 'blogUrl' in info;
	}

	/**
	 * ブログURLから情報を取得
	 */
	async fetchBlogInfo(blogUrl: string): Promise<BlogInfo> {
		// URLのバリデーション
		if (!blogUrl.includes('http')) {
			throw new Error('Invalid Blog URL');
		}

		try {
			// HTMLコンテンツを取得
			const htmlContent = await this.fetchHtmlContent(blogUrl);
			
			// HTMLからメタデータを抽出
			const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/) || 
				htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/);
			
			// ページコンテンツを取得
			const bodyContent = this.extractMainContent(htmlContent);
			const cleanedContent = this.cleanHtml(bodyContent);
			
			// Anthropic APIで要約を生成
			let summary = 'No summary available.';
			if (cleanedContent && this.settings.anthropicApiKey) {
				try {
					summary = await this.generateSummaryWithAnthropic(cleanedContent);
				} catch (error) {
					console.error('Error generating summary:', error);
					summary = 'Failed to generate summary: ' + (error instanceof Error ? error.message : String(error));
				}
			}
			
			// データを整形して返す
			return {
				title: titleMatch ? titleMatch[1].trim() : 'Unknown Title',
				summary: summary,
				blogUrl: blogUrl
			};
		} catch (error) {
			console.error('Error fetching blog information:', error);
			throw new Error('Failed to fetch blog information. Please check the URL and try again.');
		}
	}
	
	/**
	 * Amazonの本のURLから情報を取得
	 */
	async fetchBookInfo(amazonUrl: string): Promise<BookInfo> {
		// URLのバリデーション
		if (!amazonUrl.includes('amazon')) {
			throw new Error('Invalid Amazon URL');
		}

		try {
			// HTMLコンテンツを取得
			const htmlContent = await this.fetchHtmlContent(amazonUrl);
			
			// HTMLからメタデータを抽出
			const titleMatch = htmlContent.match(/<span id="productTitle"[^>]*>([^<]+)<\/span>/);
			const authorMatch = htmlContent.match(/<a class="[^"]*" href="[^"]*\/e\/[^"]*">([^<]+)<\/a>/) || 
				htmlContent.match(/id="bylineInfo"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
			
			// 商品説明を取得 (複数のパターンに対応、より詳細なコンテンツを取得)
			const summaryMatch = htmlContent.match(/<div id="bookDescription_feature_div"[^>]*>([\s\S]*?)<\/div>/) || 
				htmlContent.match(/<div id="productDescription"[^>]*>([\s\S]*?)<\/div>/) ||
				htmlContent.match(/<div class="a-expander-content[^"]*" id="[^"]*Description[^"]*"[^>]*>([\s\S]*?)<\/div>/) ||
				htmlContent.match(/<noscript><div>([\s\S]*?)<\/div><\/noscript>/);
			
			// ジャンル情報とリンクを取得
			const { genre, genreUrl } = this.extractGenreInfo(htmlContent, amazonUrl);
			
			// データを整形して返す
			return {
				title: titleMatch ? titleMatch[1].trim() : 'Unknown Title',
				author: authorMatch ? authorMatch[1].trim() : 'Unknown Author',
				genre: genre,
				genreUrl: genreUrl,
				summary: summaryMatch ? this.cleanHtml(summaryMatch[1]).trim() : 'No summary available.',
				amazonUrl: amazonUrl
			};
		} catch (error) {
			console.error('Error fetching book information:', error);
			throw new Error('Failed to fetch book information. Please check the URL and try again.');
		}
	}
	
	/**
	 * HTMLコンテンツからジャンル情報を抽出
	 */
	private extractGenreInfo(htmlContent: string, baseUrl: string): { genre: string, genreUrl: string } {
		let genre = 'Fiction'; // デフォルトのジャンル
		let genreUrl = ''; // ジャンルのURL
		
		// パンくずリストからカテゴリ階層を取得
		const breadcrumbsMatch = htmlContent.match(/id="wayfinding-breadcrumbs_feature_div"[^>]*>([\s\S]*?)<\/div>/);
		if (breadcrumbsMatch) {
			const breadcrumbs = breadcrumbsMatch[1];
			// リンクを含むすべてのaタグを抽出
			const categoryLinkElements = breadcrumbs.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/g);
			
			if (categoryLinkElements && categoryLinkElements.length > 0) {
				// 最後のカテゴリを使用
				const lastCategoryIndex = categoryLinkElements.length - 1;
				const lastCategoryElement = categoryLinkElements[lastCategoryIndex];
				
				// カテゴリ名を抽出
				const categoryTextMatch = lastCategoryElement.match(/>([^<]+)</);
				if (categoryTextMatch) {
					genre = categoryTextMatch[1].trim();
				}
				
				// URLを抽出
				const hrefMatch = lastCategoryElement.match(/href="([^"]*)"/);
				if (hrefMatch) {
					genreUrl = hrefMatch[1];
					genreUrl = this.normalizeUrl(genreUrl, baseUrl);
				}
			}
		}
		
		// 他の方法でもジャンル情報を探す
		if (genre === 'Fiction' || genre === 'Kindle Store') {
			const genreMatch = htmlContent.match(/<a class="a-link-normal a-color-tertiary"[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/);
			if (genreMatch && genreMatch[2] && genreMatch[2].trim() !== 'Kindle Store') {
				genre = genreMatch[2].trim();
				if (genreMatch[1]) {
					genreUrl = genreMatch[1];
					genreUrl = this.normalizeUrl(genreUrl, baseUrl);
				}
			}
		}
		
		return { genre, genreUrl };
	}
	
	/**
	 * 相対URLを絶対URLに変換
	 */
	private normalizeUrl(url: string, baseUrl: string): string {
		if (url.startsWith('/')) {
			const urlParts = baseUrl.match(/^(https?:\/\/[^\/]+)\//);
			if (urlParts) {
				return urlParts[1] + url;
			}
		}
		return url;
	}
	
	/**
	 * タイムアウト付きのfetchを実行
	 * @param url 取得するURL
	 * @param timeoutMs タイムアウト時間（ミリ秒）
	 * @returns Response オブジェクト
	 */
	private fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
		// AbortControllerを使ってタイムアウトを実装
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		
		return fetch(url, { signal: controller.signal })
			.finally(() => clearTimeout(timeoutId));
	}
	
	/**
	 * リトライ機能付きのfetch
	 * @param url 取得するURL
	 * @param options fetchオプション
	 * @param retries リトライ回数
	 * @param timeoutMs タイムアウト時間（ミリ秒）
	 * @returns Response オブジェクト
	 */
	private async fetchWithRetry(url: string, options = {}, retries = 3, timeoutMs = 10000): Promise<Response> {
		let lastError: Error | null = null;
		
		for (let i = 0; i < retries; i++) {
			try {
				// 指数バックオフでリトライ間隔を増やす（最初のトライではウェイトなし）
				if (i > 0) {
					const waitTime = Math.min(1000 * Math.pow(2, i - 1), 10000);
					await new Promise(resolve => setTimeout(resolve, waitTime));
				}
				
				return await this.fetchWithTimeout(url, timeoutMs);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				console.log(`Fetch attempt ${i + 1} failed: ${lastError.message}`);
			}
		}
		
		throw lastError || new Error('Failed to fetch after multiple retries');
	}

	/**
	 * URLからHTMLコンテンツを取得（複数のプロキシを試す）
	 */
	private async fetchHtmlContent(url: string): Promise<string> {
		// CORSの問題を回避するためにプロキシサービスを使用
		const proxyUrls = [
			`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
			`https://corsproxy.io/?${encodeURIComponent(url)}`,
			`https://cors-anywhere.herokuapp.com/${url}`
		];
		
		let htmlContent = '';
		let proxyError = '';
		
		// プロキシを順番に試す
		for (const proxyUrl of proxyUrls) {
			try {
				// 改良版のfetchを使用
				const response = await this.fetchWithRetry(proxyUrl, {}, 2, 15000);
				
				if (!response.ok) {
					proxyError = `Failed to fetch data: ${response.status}`;
					continue;
				}
				
				// レスポンスタイプを確認
				const contentType = response.headers.get('content-type');
				
				if (contentType && contentType.includes('application/json')) {
					// JSONレスポンスの場合
					const responseData = await response.json();
					if (responseData.contents) {
						// allorigins形式のレスポンス
						htmlContent = responseData.contents;
					}
				} else {
					// テキスト/HTMLレスポンスの場合
					htmlContent = await response.text();
				}
				
				// 成功したらループを抜ける
				if (htmlContent) break;
				
			} catch (err) {
				proxyError = `Proxy error: ${err instanceof Error ? err.message : String(err)}`;
				continue;
			}
		}
		
		if (!htmlContent) {
			throw new Error(`Failed to fetch content: ${proxyError}`);
		}
		
		return htmlContent;
	}
	
	/**
	 * メインコンテンツを抽出するヘルパーメソッド
	 */
	private extractMainContent(html: string): string {
		// 一般的なコンテンツコンテナを探す
		const contentMatches = [
			html.match(/<article[^>]*>([\s\S]*?)<\/article>/),
			html.match(/<main[^>]*>([\s\S]*?)<\/main>/),
			html.match(/<div[^>]*?class="[^"]*?content[^"]*?"[^>]*>([\s\S]*?)<\/div>/i),
			html.match(/<div[^>]*?class="[^"]*?entry[^"]*?"[^>]*>([\s\S]*?)<\/div>/i),
			html.match(/<div[^>]*?class="[^"]*?post[^"]*?"[^>]*>([\s\S]*?)<\/div>/i)
		];
		
		for (const match of contentMatches) {
			if (match && match[1]) {
				return match[1];
			}
		}
		
		// メインコンテンツが見つからない場合はbodyタグの中身を返す
		const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
		return bodyMatch ? bodyMatch[1] : html;
	}
	
	/**
	 * Anthropic APIで要約を生成するメソッド
	 */
	private async generateSummaryWithAnthropic(content: string): Promise<string> {
		const apiKey = this.settings.anthropicApiKey;
		if (!apiKey) {
			// APIキーが設定されていない場合は適切なメッセージを返す
			return 'No summary available. Please set an Anthropic API key in settings to enable automatic summarization.';
		}
		
		const maxContentLength = 10000; // 長すぎるコンテンツは切り詰める
		const truncatedContent = content.length > maxContentLength ? 
			content.substring(0, maxContentLength) + '...' : content;
		
		const prompt = `
Here's the content of a technical blog post. Please summarize it in a concise way, highlighting the main points, key technical concepts, and any important conclusions:

${truncatedContent}

Summary:`;
		
		try {
			const response = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify({
					model: this.settings.llmModel,
					max_tokens: 1000,
					messages: [
						{ role: 'user', content: prompt }
					]
				})
			});
			
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(`Anthropic API Error: ${errorData.error?.message || response.statusText}`);
			}
			
			const data = await response.json();
			return data.content[0].text || 'No summary available.';
		} catch (error) {
			console.error('Error calling Anthropic API:', error);
			// エラーメッセージをユーザーフレンドリーにする
			return `Unable to generate summary: ${error instanceof Error ? error.message : String(error)}. Check your API key and try again.`;
		}
	}
	
	/**
	 * HTMLタグを除去するヘルパーメソッド（改行を維持）
	 */
	private cleanHtml(html: string): string {
		// <br>や</p>タグを改行に置換してから他のHTMLタグを削除
		return html
			.replace(/<br[^>]*>/gi, '\n')
			.replace(/<\/p>/gi, '\n\n')
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s{2,}/g, ' ')
			.trim();
	}
	
	/**
	 * Obsidianのタグやリンクに干渉する文字を除去し、Markdownリンクを作成
	 */
	private createMarkdownLink(title: string, url: string): string {
		// Obsidianのタグやリンクに使われる特殊文字を除去
		const cleanTitle = title.replace(/[#\[\]|]/g, '').trim();
		// Markdown形式のリンクを作成
		return `[${cleanTitle}](${url})`;
	}
	
	/**
	 * カーソル位置のURLを取得するヘルパーメソッド
	 */
	private getUrlUnderCursor(editor: Editor): string | null {
		const cursorPos = editor.getCursor();
		const line = editor.getLine(cursorPos.line);
		
		// 現在の行でURLを検索
		let match;
		while ((match = URL_PATTERN.exec(line)) !== null) {
			const start = match.index;
			const end = start + match[0].length;
			
			// カーソルがURLの範囲内にある場合
			if (cursorPos.ch >= start && cursorPos.ch <= end) {
				return match[0];
			}
		}
		
		// 正規表現のインデックスをリセット
		URL_PATTERN.lastIndex = 0;
		
		// カーソルの直前または直後のURLも検索
		const matches = line.match(URL_PATTERN);
		if (matches) {
			// 最も近いURLを探す
			let closestUrl = null;
			let minDistance = Number.MAX_VALUE;
			
			for (const url of matches) {
				const start = line.indexOf(url);
				const end = start + url.length;
				const distanceToStart = Math.abs(cursorPos.ch - start);
				const distanceToEnd = Math.abs(cursorPos.ch - end);
				const minDist = Math.min(distanceToStart, distanceToEnd);
				
				if (minDist < minDistance) {
					minDistance = minDist;
					closestUrl = url;
				}
			}
			
			// カーソルから10文字以内にURLがある場合は取得
			if (minDistance <= 10) {
				return closestUrl;
			}
		}
		
		return null;
	}
}

/**
 * URL入力モーダルの基本インターフェース
 */
interface UrlModal {
	url: string;
	startProcessing(): Promise<void>;
	open(): void;
	close(): void;
}

/**
 * 書籍URL入力用のモーダル
 */
class BookUrlModal extends Modal implements UrlModal {
	plugin: BookCardCreator;
	url: string = '';
	loadingContainer: HTMLElement;
	buttonContainer: HTMLElement;
	urlInput: HTMLInputElement;

	constructor(app: App, plugin: BookCardCreator) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Enter Amazon Book URL' });

		// URL入力フィールド
		const urlInputContainer = contentEl.createDiv();
		this.urlInput = urlInputContainer.createEl('input', {
			attr: {
				type: 'text',
				placeholder: 'https://www.amazon.com/...'
			},
			cls: 'book-url-input'
		});
		this.urlInput.style.width = '100%';
		this.urlInput.style.marginBottom = '1em';
		this.urlInput.addEventListener('input', (e) => {
			this.url = (e.target as HTMLInputElement).value;
		});
		// 事前に設定されたURLがある場合は表示
		if (this.url) {
			this.urlInput.value = this.url;
		}

		// ローディングインジケータ（最初は非表示）
		this.loadingContainer = contentEl.createDiv({ cls: 'loading-container' });
		this.loadingContainer.style.display = 'none';
		const spinner = this.loadingContainer.createDiv({ cls: 'loading-spinner' });
		this.loadingContainer.createDiv({ cls: 'loading-text', text: 'Fetching book information...' });

		// ボタンコンテナ
		this.buttonContainer = contentEl.createDiv();
		this.buttonContainer.style.display = 'flex';
		this.buttonContainer.style.justifyContent = 'flex-end';
		this.buttonContainer.style.gap = '0.5em';

		// キャンセルボタン
		const cancelButton = this.buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.close());

		// 作成ボタン
		const createButton = this.buttonContainer.createEl('button', { text: 'Create', cls: 'mod-cta' });
		createButton.addEventListener('click', async () => {
			this.startProcessing();
		});

		// 入力フィールドにフォーカス
		this.urlInput.focus();
	}

	// URLからカード作成処理を開始
	async startProcessing() {
		if (!this.url) {
			new Notice('Please enter a valid Amazon URL');
			return;
		}

		try {
			// ローディングインジケータを表示し、ボタンを非表示
			this.loadingContainer.style.display = 'flex';
			this.buttonContainer.style.display = 'none';
			
			// Notice表示も併用
			new Notice('Fetching book information...');
			
			const bookInfo = await this.plugin.fetchBookInfo(this.url);
			
			// 生成中のメッセージに更新
			const loadingText = this.loadingContainer.querySelector('.loading-text') as HTMLElement;
			if (loadingText) {
				loadingText.innerText = 'Creating book card...';
			}
			
			await this.plugin.createNoteFromTemplate(bookInfo);
			this.close();
		} catch (error) {
			// エラー時はローディングを非表示にしてボタンを再表示
			this.loadingContainer.style.display = 'none';
			this.buttonContainer.style.display = 'flex';
			new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * 設定タブの実装
 */
class BookCardCreatorSettingTab extends PluginSettingTab {
	plugin: BookCardCreator;

	constructor(app: App, plugin: BookCardCreator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		
		// プラグイン固有のクラスを追加
		containerEl.addClass('book-card-creator');

		containerEl.createEl('h2', { text: 'Book Card Creator Settings' });

		// セクションを明確に分けて表示
		this.renderAmazonBookSection(containerEl);
		this.renderTechBlogSection(containerEl);
		this.renderApiSection(containerEl);
		this.renderTemplateVariables(containerEl);
	}

	// Amazon Book Cardsの設定セクション
	private renderAmazonBookSection(containerEl: HTMLElement): void {
		const amazonSection = containerEl.createDiv('settings-section');
		amazonSection.createEl('h3', { text: 'Amazon Book Cards Settings' });

		// 書籍用テンプレートファイルの設定
		new Setting(amazonSection)
			.setName('Book template file')
			.setDesc('Select the template file for Amazon book cards')
			.addText(text => text
				.setPlaceholder('Example: templates/book-template.md')
				.setValue(this.plugin.settings.bookTemplatePath)
				.onChange(async (value) => {
					this.plugin.settings.bookTemplatePath = value;
					await this.plugin.saveSettings();
				})
			)
			.addButton(button => button
				.setButtonText('Browse')
				.onClick(async () => {
					// 既存のファイルを選択するための新しいモーダルを作成
					new FileSelectorModal(this.app, (file) => {
						this.plugin.settings.bookTemplatePath = file.path;
						this.plugin.saveSettings();
						this.display(); // 設定画面を更新
					}).open();
				})
			);

		// 書籍用出力フォルダの設定
		new Setting(amazonSection)
			.setName('Book output folder')
			.setDesc('Select the folder where Amazon book cards will be created')
			.addText(text => text
				.setPlaceholder('Example: Books')
				.setValue(this.plugin.settings.bookOutputFolder)
				.onChange(async (value) => {
					this.plugin.settings.bookOutputFolder = value;
					await this.plugin.saveSettings();
				})
			)
			.addButton(button => button
				.setButtonText('Browse')
				.onClick(async () => {
					// フォルダを選択するための新しいモーダルを作成
					new FolderSelectorModal(this.app, (folder) => {
						this.plugin.settings.bookOutputFolder = folder.path;
						this.plugin.saveSettings();
						this.display(); // 設定画面を更新
					}).open();
				})
			);
	}

	// Tech Blog Cardsの設定セクション
	private renderTechBlogSection(containerEl: HTMLElement): void {
		const blogSection = containerEl.createDiv('settings-section');
		blogSection.createEl('h3', { text: 'Tech Blog Cards Settings' });

		// ブログ用テンプレートファイルの設定
		new Setting(blogSection)
			.setName('Blog template file')
			.setDesc('Select the template file for tech blog cards')
			.addText(text => text
				.setPlaceholder('Example: templates/blog-template.md')
				.setValue(this.plugin.settings.blogTemplatePath)
				.onChange(async (value) => {
					this.plugin.settings.blogTemplatePath = value;
					await this.plugin.saveSettings();
				})
			)
			.addButton(button => button
				.setButtonText('Browse')
				.onClick(async () => {
					// 既存のファイルを選択するための新しいモーダルを作成
					new FileSelectorModal(this.app, (file) => {
						this.plugin.settings.blogTemplatePath = file.path;
						this.plugin.saveSettings();
						this.display(); // 設定画面を更新
					}).open();
				})
			);

		// ブログ用出力フォルダの設定
		new Setting(blogSection)
			.setName('Blog output folder')
			.setDesc('Select the folder where tech blog cards will be created')
			.addText(text => text
				.setPlaceholder('Example: TechBlogs')
				.setValue(this.plugin.settings.blogOutputFolder)
				.onChange(async (value) => {
					this.plugin.settings.blogOutputFolder = value;
					await this.plugin.saveSettings();
				})
			)
			.addButton(button => button
				.setButtonText('Browse')
				.onClick(async () => {
					// フォルダを選択するための新しいモーダルを作成
					new FolderSelectorModal(this.app, (folder) => {
						this.plugin.settings.blogOutputFolder = folder.path;
						this.plugin.saveSettings();
						this.display(); // 設定画面を更新
					}).open();
				})
			);
	}

	// API設定セクション
	private renderApiSection(containerEl: HTMLElement): void {
		const apiSection = containerEl.createDiv('settings-section');
		apiSection.createEl('h3', { text: 'API Settings for Blog Summarization' });

		// Anthropic API Keyの設定
		new Setting(apiSection)
			.setName('Anthropic API Key')
			.setDesc('Enter your Anthropic API key for tech blog summary generation')
			.addText(text => text
				.setPlaceholder('sk-ant-...')
				.setValue(this.plugin.settings.anthropicApiKey)
				.setDisabled(false)
				.inputEl.type = 'password'
			)
			.addExtraButton(btn => btn
				.setIcon('reset')
				.setTooltip('Save API Key')
				.onClick(async () => {
					const inputEl = apiSection.querySelector('input[type="password"]') as HTMLInputElement;
					this.plugin.settings.anthropicApiKey = inputEl.value;
					await this.plugin.saveSettings();
					new Notice('API Key saved');
				})
			);
			
		// LLMモデルの選択
		new Setting(apiSection)
			.setName('Claude Model')
			.setDesc('Select which Claude model to use for blog summarization')
			.addDropdown(dropdown => dropdown
				.addOption('claude-3-haiku-20240307', 'Claude 3 Haiku (Fast)')
				.addOption('claude-3-sonnet-20240229', 'Claude 3 Sonnet (Balanced)')
				.addOption('claude-3-opus-20240229', 'Claude 3 Opus (Powerful)')
				.setValue(this.plugin.settings.llmModel)
				.onChange(async (value) => {
					this.plugin.settings.llmModel = value;
					await this.plugin.saveSettings();
				})
			);
	}

	// テンプレート変数の説明セクション
	private renderTemplateVariables(containerEl: HTMLElement): void {
		const variablesSection = containerEl.createDiv('settings-section');
		variablesSection.createEl('h3', { text: 'Template Variables' });
		
		const templateInfo = variablesSection.createEl('div');
		templateInfo.innerHTML = `
			<p>You can use the following variables in your templates:</p>
			<h4>For Amazon Book templates:</h4>
			<ul>
				<li><code>{{book-creator:title}}</code> - Book title</li>
				<li><code>{{book-creator:author}}</code> - Book author</li>
				<li><code>{{book-creator:genre}}</code> - Book genre</li>
				<li><code>{{book-creator:genre-link}}</code> - Markdown link to genre page</li>
				<li><code>{{book-creator:summary}}</code> - Book summary</li>
				<li><code>{{book-creator:amazon-link}}</code> - Markdown link to Amazon page</li>
			</ul>
			<h4>For Tech Blog templates:</h4>
			<ul>
				<li><code>{{blog-creator:title}}</code> - Blog title</li>
				<li><code>{{blog-creator:summary}}</code> - Blog summary</li>
				<li><code>{{blog-creator:blog-link}}</code> - Markdown link to blog page</li>
			</ul>
		`;
	}
}

// ファイル選択用のモーダル
class FileSelectorModal extends Modal {
	onSelect: (file: TFile) => void;

	constructor(app: App, onSelect: (file: TFile) => void) {
		super(app);
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Select Template File' });

		const fileList = contentEl.createDiv();
		fileList.style.maxHeight = '400px';
		fileList.style.overflow = 'auto';

		// マークダウンファイルの一覧を表示
		this.app.vault.getMarkdownFiles().forEach(file => {
			const fileItem = fileList.createEl('div', { cls: 'file-item' });
			fileItem.style.padding = '5px';
			fileItem.style.cursor = 'pointer';
			fileItem.style.borderBottom = '1px solid var(--background-modifier-border)';
			fileItem.innerHTML = `<span>${file.path}</span>`;
			
			fileItem.addEventListener('click', () => {
				this.onSelect(file);
				this.close();
			});

			fileItem.addEventListener('mouseenter', () => {
				fileItem.style.backgroundColor = 'var(--background-modifier-hover)';
			});

			fileItem.addEventListener('mouseleave', () => {
				fileItem.style.backgroundColor = '';
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * ブログURL入力用のモーダル
 */
class TechBlogUrlModal extends Modal implements UrlModal {
	plugin: BookCardCreator;
	url: string = '';
	loadingContainer: HTMLElement;
	buttonContainer: HTMLElement;
	urlInput: HTMLInputElement;

	constructor(app: App, plugin: BookCardCreator) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Enter Tech Blog URL' });

		// URL入力フィールド
		const urlInputContainer = contentEl.createDiv();
		this.urlInput = urlInputContainer.createEl('input', {
			attr: {
				type: 'text',
				placeholder: 'https://blog.example.com/...'
			},
			cls: 'blog-url-input'
		});
		this.urlInput.style.width = '100%';
		this.urlInput.style.marginBottom = '1em';
		this.urlInput.addEventListener('input', (e) => {
			this.url = (e.target as HTMLInputElement).value;
		});
		// 事前に設定されたURLがある場合は表示
		if (this.url) {
			this.urlInput.value = this.url;
		}

		// APIキーの警告（設定されていない場合）
		if (!this.plugin.settings.anthropicApiKey) {
			const warningDiv = contentEl.createDiv();
			warningDiv.style.color = 'var(--text-error)';
			warningDiv.style.marginBottom = '1em';
			warningDiv.createEl('p', { text: 'Warning: Anthropic API Key is not set. LLM summary will not be available.' });
		}
		
		// 選択されているモデルの情報を表示
		const modelInfo = contentEl.createDiv();
		modelInfo.style.marginBottom = '1em';
		let modelName = this.getModelDisplayName(this.plugin.settings.llmModel);
		modelInfo.createEl('p', { text: `Selected model: ${modelName}` });

		// ローディングインジケータ（最初は非表示）
		this.loadingContainer = contentEl.createDiv({ cls: 'loading-container' });
		this.loadingContainer.style.display = 'none';
		const spinner = this.loadingContainer.createDiv({ cls: 'loading-spinner' });
		this.loadingContainer.createDiv({ cls: 'loading-text', text: 'Fetching blog information...' });

		// ボタンコンテナ
		this.buttonContainer = contentEl.createDiv();
		this.buttonContainer.style.display = 'flex';
		this.buttonContainer.style.justifyContent = 'flex-end';
		this.buttonContainer.style.gap = '0.5em';

		// キャンセルボタン
		const cancelButton = this.buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.close());

		// 作成ボタン
		const createButton = this.buttonContainer.createEl('button', { text: 'Create', cls: 'mod-cta' });
		createButton.addEventListener('click', async () => {
			this.startProcessing();
		});

		// 入力フィールドにフォーカス
		this.urlInput.focus();
	}
	
	// モデル名の表示用文字列を取得
	private getModelDisplayName(modelId: string): string {
		const modelMap: Record<string, string> = {
			'claude-3-haiku-20240307': 'Claude 3 Haiku (Fast)',
			'claude-3-sonnet-20240229': 'Claude 3 Sonnet (Balanced)',
			'claude-3-opus-20240229': 'Claude 3 Opus (Powerful)'
		};
		
		return modelMap[modelId] || 'Unknown';
	}

	// URLからカード作成処理を開始
	async startProcessing() {
		if (!this.url) {
			new Notice('Please enter a valid tech blog URL');
			return;
		}

		try {
			// ローディングインジケータを表示し、ボタンを非表示
			this.loadingContainer.style.display = 'flex';
			this.buttonContainer.style.display = 'none';
			
			// Notice表示も併用
			new Notice('Fetching blog information...');
			
			const blogInfo = await this.plugin.fetchBlogInfo(this.url);
			
			// 生成中のメッセージに更新
			const loadingText = this.loadingContainer.querySelector('.loading-text') as HTMLElement;
			if (loadingText) {
				loadingText.innerText = 'Creating blog card...';
			}
			
			await this.plugin.createNoteFromTemplate(blogInfo);
			this.close();
		} catch (error) {
			// エラー時はローディングを非表示にしてボタンを再表示
			this.loadingContainer.style.display = 'none';
			this.buttonContainer.style.display = 'flex';
			new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * フォルダ選択用のモーダル
 */
class FolderSelectorModal extends Modal {
	onSelect: (folder: TFolder) => void;

	constructor(app: App, onSelect: (folder: TFolder) => void) {
		super(app);
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Select Output Folder' });

		const folderList = contentEl.createDiv();
		folderList.style.maxHeight = '400px';
		folderList.style.overflow = 'auto';

		// フォルダの一覧を取得して表示
		const folders: TFolder[] = [];
		this.getAllFolders(this.app.vault.getRoot(), folders);

		folders.forEach(folder => {
			const folderItem = folderList.createEl('div', { cls: 'folder-item' });
			folderItem.style.padding = '5px';
			folderItem.style.cursor = 'pointer';
			folderItem.style.borderBottom = '1px solid var(--background-modifier-border)';
			folderItem.innerHTML = `<span>${folder.path || '/'}</span>`;
			
			folderItem.addEventListener('click', () => {
				this.onSelect(folder);
				this.close();
			});

			folderItem.addEventListener('mouseenter', () => {
				folderItem.style.backgroundColor = 'var(--background-modifier-hover)';
			});

			folderItem.addEventListener('mouseleave', () => {
				folderItem.style.backgroundColor = '';
			});
		});
	}

	// フォルダを再帰的に取得
	getAllFolders(folder: TFolder, folders: TFolder[]) {
		folders.push(folder);
		
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				this.getAllFolders(child, folders);
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}