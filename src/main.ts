import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile } from 'obsidian';

interface BookCardCreatorSettings {
	templatePath: string;
	outputFolder: string;
}

const DEFAULT_SETTINGS: BookCardCreatorSettings = {
	templatePath: '',
	outputFolder: ''
}

export default class BookCardCreator extends Plugin {
	settings: BookCardCreatorSettings;

	async onload() {
		await this.loadSettings();

		// コマンドパレットにコマンドを追加
		this.addCommand({
			id: 'create-book-card',
			name: 'Create Book Card from Amazon URL',
			callback: () => {
				new BookUrlModal(this.app, this).open();
			}
		});

		// 設定タブを追加
		this.addSettingTab(new BookCardCreatorSettingTab(this.app, this));
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async createNoteFromTemplate(bookInfo: BookInfo) {
		// テンプレートファイルが存在するか確認
		const templateFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
		if (!(templateFile instanceof TFile)) {
			new Notice('Template file not found. Please check your settings.');
			return;
		}

		// 出力フォルダが存在するか確認
		const outputFolder = this.app.vault.getAbstractFileByPath(this.settings.outputFolder);
		if (!(outputFolder instanceof TFolder)) {
			new Notice('Output folder not found. Please check your settings.');
			return;
		}

		// テンプレートの内容を取得
		const templateContent = await this.app.vault.read(templateFile);

		// テンプレートの内容を置換
		let newContent = templateContent;
		newContent = newContent.replace(/{{book-creator:title}}/g, bookInfo.title);
		newContent = newContent.replace(/{{book-creator:author}}/g, bookInfo.author);
		newContent = newContent.replace(/{{book-creator:genre}}/g, bookInfo.genre);
		newContent = newContent.replace(/{{book-creator:summary}}/g, bookInfo.summary);
		// Amazon URLをMarkdownリンクとして挿入
		newContent = newContent.replace(/{{book-creator:amazon-link}}/g, this.createMarkdownLink(bookInfo.title, bookInfo.amazonUrl));

		// ファイル名（タイトルから不正な文字を除去）
		const fileName = `${bookInfo.title.replace(/[\\/:*?"<>|]/g, '')}.md`;
		const filePath = `${this.settings.outputFolder}/${fileName}`;

		// 新しいノートを作成
		try {
			await this.app.vault.create(filePath, newContent);
			new Notice(`Book card created: ${fileName}`);
			
			// 作成したノートを開く
			const newFile = this.app.vault.getAbstractFileByPath(filePath);
			if (newFile instanceof TFile) {
				this.app.workspace.getLeaf().openFile(newFile);
			}
		} catch (error) {
			new Notice(`Error creating note: ${error}`);
		}
	}

	async fetchBookInfo(amazonUrl: string): Promise<BookInfo> {
		// URLのバリデーション
		if (!amazonUrl.includes('amazon')) {
			throw new Error('Invalid Amazon URL');
		}

		try {
			// CORSの問題を回避するためにプロキシサービスを使用
			// 複数のプロキシオプションを用意
			const proxyUrls = [
				`https://api.allorigins.win/get?url=${encodeURIComponent(amazonUrl)}`,
				`https://corsproxy.io/?${encodeURIComponent(amazonUrl)}`,
				`https://cors-anywhere.herokuapp.com/${amazonUrl}`
			];
			
			let htmlContent = '';
			let proxyError = '';
			
			// プロキシを順番に試す
			for (const proxyUrl of proxyUrls) {
				try {
					const response = await fetch(proxyUrl);
					
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
					proxyError = `Proxy error: ${err.message}`;
					continue;
				}
			}
			
			if (!htmlContent) {
				throw new Error(`Failed to fetch Amazon data: ${proxyError}`);
			}
			
			// HTMLからメタデータを抽出
			const titleMatch = htmlContent.match(/<span id="productTitle"[^>]*>([^<]+)<\/span>/);
			const authorMatch = htmlContent.match(/<a class="[^"]*" href="[^"]*\/e\/[^"]*">([^<]+)<\/a>/) || 
				htmlContent.match(/id="bylineInfo"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
			
			// 商品説明を取得 (複数のパターンに対応)
			const summaryMatch = htmlContent.match(/<div id="bookDescription_feature_div"[^>]*>([\s\S]*?)<\/div>/) || 
				htmlContent.match(/<div id="productDescription"[^>]*>([\s\S]*?)<\/div>/);
			
			// ジャンル情報を取得（カテゴリから推測）
			const genreMatch = htmlContent.match(/<a class="a-link-normal a-color-tertiary"[^>]*>([^<]+)<\/a>/) || 
				htmlContent.match(/id="wayfinding-breadcrumbs_feature_div"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
			
			// データを整形して返す
			return {
				title: titleMatch ? titleMatch[1].trim() : 'Unknown Title',
				author: authorMatch ? authorMatch[1].trim() : 'Unknown Author',
				genre: genreMatch ? genreMatch[1].trim() : 'Fiction',
				summary: summaryMatch ? this.cleanHtml(summaryMatch[1]).trim() : 'No summary available.',
				amazonUrl: amazonUrl // Amazon URLを保存
			};
		} catch (error) {
			console.error('Error fetching book information:', error);
			throw new Error('Failed to fetch book information. Please check the URL and try again.');
		}
	}
	
	// HTMLタグを除去するヘルパーメソッド
	private cleanHtml(html: string): string {
		return html.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ');
	}
	
	// Obsidianのタグやリンクに干渉する文字を除去し、Markdownリンクを作成
	private createMarkdownLink(title: string, url: string): string {
		// Obsidianのタグやリンクに使われる特殊文字を除去
		const cleanTitle = title.replace(/[#\[\]|]/g, '').trim();
		// Markdown形式のリンクを作成
		return `[${cleanTitle}](${url})`;
	}
}

interface BookInfo {
	title: string;
	author: string;
	genre: string;
	summary: string;
	amazonUrl: string;
}

class BookUrlModal extends Modal {
	plugin: BookCardCreator;
	url: string = '';

	constructor(app: App, plugin: BookCardCreator) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Enter Amazon Book URL' });

		// URL入力フィールド
		const urlInputContainer = contentEl.createDiv();
		const urlInput = urlInputContainer.createEl('input', {
			attr: {
				type: 'text',
				placeholder: 'https://www.amazon.com/...'
			},
			cls: 'book-url-input'
		});
		urlInput.style.width = '100%';
		urlInput.style.marginBottom = '1em';
		urlInput.addEventListener('input', (e) => {
			this.url = (e.target as HTMLInputElement).value;
		});

		// ボタンコンテナ
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '0.5em';

		// キャンセルボタン
		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => this.close());

		// 作成ボタン
		const createButton = buttonContainer.createEl('button', { text: 'Create', cls: 'mod-cta' });
		createButton.addEventListener('click', async () => {
			if (!this.url) {
				new Notice('Please enter a valid Amazon URL');
				return;
			}

			try {
				new Notice('Fetching book information...');
				const bookInfo = await this.plugin.fetchBookInfo(this.url);
				await this.plugin.createNoteFromTemplate(bookInfo);
				this.close();
			} catch (error) {
				new Notice(`Error: ${error}`);
			}
		});

		// 入力フィールドにフォーカス
		urlInput.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class BookCardCreatorSettingTab extends PluginSettingTab {
	plugin: BookCardCreator;

	constructor(app: App, plugin: BookCardCreator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Book Card Creator Settings' });

		// テンプレートファイルの設定
		new Setting(containerEl)
			.setName('Template file')
			.setDesc('Select the template file for book cards')
			.addText(text => text
				.setPlaceholder('Example: templates/book-template.md')
				.setValue(this.plugin.settings.templatePath)
				.onChange(async (value) => {
					this.plugin.settings.templatePath = value;
					await this.plugin.saveSettings();
				})
			)
			.addButton(button => button
				.setButtonText('Browse')
				.onClick(async () => {
					// 既存のファイルを選択するための新しいモーダルを作成
					new FileSelectorModal(this.app, (file) => {
						this.plugin.settings.templatePath = file.path;
						this.plugin.saveSettings();
						this.display(); // 設定画面を更新
					}).open();
				})
			);

		// 出力フォルダの設定
		new Setting(containerEl)
			.setName('Output folder')
			.setDesc('Select the folder where book cards will be created')
			.addText(text => text
				.setPlaceholder('Example: Books')
				.setValue(this.plugin.settings.outputFolder)
				.onChange(async (value) => {
					this.plugin.settings.outputFolder = value;
					await this.plugin.saveSettings();
				})
			)
			.addButton(button => button
				.setButtonText('Browse')
				.onClick(async () => {
					// フォルダを選択するための新しいモーダルを作成
					new FolderSelectorModal(this.app, (folder) => {
						this.plugin.settings.outputFolder = folder.path;
						this.plugin.saveSettings();
						this.display(); // 設定画面を更新
					}).open();
				})
			);

		// テンプレートの使い方の説明
		containerEl.createEl('h3', { text: 'Template Variables' });
		const templateInfo = containerEl.createEl('div');
		templateInfo.innerHTML = `
			<p>You can use the following variables in your template:</p>
			<ul>
				<li><code>{{book-creator:title}}</code> - Book title</li>
				<li><code>{{book-creator:author}}</code> - Book author</li>
				<li><code>{{book-creator:genre}}</code> - Book genre</li>
				<li><code>{{book-creator:summary}}</code> - Book summary</li>
				<li><code>{{book-creator:amazon-link}}</code> - Markdown link to Amazon page</li>
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

// フォルダ選択用のモーダル
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