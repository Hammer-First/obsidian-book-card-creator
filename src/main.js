import { __awaiter } from "tslib";
import { Modal, Notice, Plugin, PluginSettingTab, Setting, TFolder, TFile } from 'obsidian';
const DEFAULT_SETTINGS = {
    templatePath: '',
    outputFolder: ''
};
export default class BookCardCreator extends Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
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
        });
    }
    onunload() {
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
    createNoteFromTemplate(bookInfo) {
        return __awaiter(this, void 0, void 0, function* () {
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
            const templateContent = yield this.app.vault.read(templateFile);
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
                yield this.app.vault.create(filePath, newContent);
                new Notice(`Book card created: ${fileName}`);
                // 作成したノートを開く
                const newFile = this.app.vault.getAbstractFileByPath(filePath);
                if (newFile instanceof TFile) {
                    this.app.workspace.getLeaf().openFile(newFile);
                }
            }
            catch (error) {
                new Notice(`Error creating note: ${error}`);
            }
        });
    }
    fetchBookInfo(amazonUrl) {
        return __awaiter(this, void 0, void 0, function* () {
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
                        const response = yield fetch(proxyUrl);
                        if (!response.ok) {
                            proxyError = `Failed to fetch data: ${response.status}`;
                            continue;
                        }
                        // レスポンスタイプを確認
                        const contentType = response.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                            // JSONレスポンスの場合
                            const responseData = yield response.json();
                            if (responseData.contents) {
                                // allorigins形式のレスポンス
                                htmlContent = responseData.contents;
                            }
                        }
                        else {
                            // テキスト/HTMLレスポンスの場合
                            htmlContent = yield response.text();
                        }
                        // 成功したらループを抜ける
                        if (htmlContent)
                            break;
                    }
                    catch (err) {
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
            }
            catch (error) {
                console.error('Error fetching book information:', error);
                throw new Error('Failed to fetch book information. Please check the URL and try again.');
            }
        });
    }
    // HTMLタグを除去するヘルパーメソッド
    cleanHtml(html) {
        return html.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ');
    }
    // Obsidianのタグやリンクに干渉する文字を除去し、Markdownリンクを作成
    createMarkdownLink(title, url) {
        // Obsidianのタグやリンクに使われる特殊文字を除去
        const cleanTitle = title.replace(/[#\[\]|]/g, '').trim();
        // Markdown形式のリンクを作成
        return `[${cleanTitle}](${url})`;
    }
}
class BookUrlModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.url = '';
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
            this.url = e.target.value;
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
        createButton.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            if (!this.url) {
                new Notice('Please enter a valid Amazon URL');
                return;
            }
            try {
                new Notice('Fetching book information...');
                const bookInfo = yield this.plugin.fetchBookInfo(this.url);
                yield this.plugin.createNoteFromTemplate(bookInfo);
                this.close();
            }
            catch (error) {
                new Notice(`Error: ${error}`);
            }
        }));
        // 入力フィールドにフォーカス
        urlInput.focus();
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
class BookCardCreatorSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
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
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.templatePath = value;
            yield this.plugin.saveSettings();
        })))
            .addButton(button => button
            .setButtonText('Browse')
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            // 既存のファイルを選択するための新しいモーダルを作成
            new FileSelectorModal(this.app, (file) => {
                this.plugin.settings.templatePath = file.path;
                this.plugin.saveSettings();
                this.display(); // 設定画面を更新
            }).open();
        })));
        // 出力フォルダの設定
        new Setting(containerEl)
            .setName('Output folder')
            .setDesc('Select the folder where book cards will be created')
            .addText(text => text
            .setPlaceholder('Example: Books')
            .setValue(this.plugin.settings.outputFolder)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.outputFolder = value;
            yield this.plugin.saveSettings();
        })))
            .addButton(button => button
            .setButtonText('Browse')
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            // フォルダを選択するための新しいモーダルを作成
            new FolderSelectorModal(this.app, (folder) => {
                this.plugin.settings.outputFolder = folder.path;
                this.plugin.saveSettings();
                this.display(); // 設定画面を更新
            }).open();
        })));
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
    constructor(app, onSelect) {
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
    constructor(app, onSelect) {
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
        const folders = [];
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
    getAllFolders(folder, folders) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBNkIsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFPdkgsTUFBTSxnQkFBZ0IsR0FBNEI7SUFDakQsWUFBWSxFQUFFLEVBQUU7SUFDaEIsWUFBWSxFQUFFLEVBQUU7Q0FDaEIsQ0FBQTtBQUVELE1BQU0sQ0FBQyxPQUFPLE9BQU8sZUFBZ0IsU0FBUSxNQUFNO0lBRzVDLE1BQU07O1lBQ1gsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFFMUIsbUJBQW1CO1lBQ25CLElBQUksQ0FBQyxVQUFVLENBQUM7Z0JBQ2YsRUFBRSxFQUFFLGtCQUFrQjtnQkFDdEIsSUFBSSxFQUFFLGtDQUFrQztnQkFDeEMsUUFBUSxFQUFFLEdBQUcsRUFBRTtvQkFDZCxJQUFJLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN6QyxDQUFDO2FBQ0QsQ0FBQyxDQUFDO1lBRUgsVUFBVTtZQUNWLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbkUsQ0FBQztLQUFBO0lBRUQsUUFBUTtJQUNSLENBQUM7SUFFSyxZQUFZOztZQUNqQixJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDNUUsQ0FBQztLQUFBO0lBRUssWUFBWTs7WUFDakIsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNw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Q2hELE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFckIsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDckMsSUFBSSxLQUFLLFlBQVksT0FBTyxFQUFFLENBQUM7Z0JBQzlCLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3BDLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU87UUFDTixNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNuQixDQUFDO0NBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIEVkaXRvciwgTWFya2Rvd25WaWV3LCBNb2RhbCwgTm90aWNlLCBQbHVnaW4sIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIFRGb2xkZXIsIFRGaWxlIH0gZnJvbSAnb2JzaWRpYW4nO1xuXG5pbnRlcmZhY2UgQm9va0NhcmRDcmVhdG9yU2V0dGluZ3Mge1xuXHR0ZW1wbGF0ZVBhdGg6IHN0cmluZztcblx0b3V0cHV0Rm9sZGVyOiBzdHJpbmc7XG59XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IEJvb2tDYXJkQ3JlYXRvclNldHRpbmdzID0ge1xuXHR0ZW1wbGF0ZVBhdGg6ICcnLFxuXHRvdXRwdXRGb2xkZXI6ICcnXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJvb2tDYXJkQ3JlYXRvciBleHRlbmRzIFBsdWdpbiB7XG5cdHNldHRpbmdzOiBCb29rQ2FyZENyZWF0b3JTZXR0aW5ncztcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuXHRcdC8vIOOCs+ODnuODs+ODieODkeODrOODg+ODiOOBq+OCs+ODnuODs+ODieOCkui/veWKoFxuXHRcdHRoaXMuYWRkQ29tbWFuZCh7XG5cdFx0XHRpZDogJ2NyZWF0ZS1ib29rLWNhcmQnLFxuXHRcdFx0bmFtZTogJ0NyZWF0ZSBCb29rIENhcmQgZnJvbSBBbWF6b24gVVJMJyxcblx0XHRcdGNhbGxiYWNrOiAoKSA9PiB7XG5cdFx0XHRcdG5ldyBCb29rVXJsTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIOioreWumuOCv+ODluOCkui/veWKoFxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgQm9va0NhcmRDcmVhdG9yU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXHR9XG5cblx0b251bmxvYWQoKSB7XG5cdH1cblxuXHRhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG5cdH1cblxuXHRhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU5vdGVGcm9tVGVtcGxhdGUoYm9va0luZm86IEJvb2tJbmZvKSB7XG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44OV44Kh44Kk44Or44GM5a2Y5Zyo44GZ44KL44GL56K66KqNXG5cdFx0Y29uc3QgdGVtcGxhdGVGaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHRoaXMuc2V0dGluZ3MudGVtcGxhdGVQYXRoKTtcblx0XHRpZiAoISh0ZW1wbGF0ZUZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHtcblx0XHRcdG5ldyBOb3RpY2UoJ1RlbXBsYXRlIGZpbGUgbm90IGZvdW5kLiBQbGVhc2UgY2hlY2sgeW91ciBzZXR0aW5ncy4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyDlh7rlipvjg5Xjgqnjg6vjg4DjgYzlrZjlnKjjgZnjgovjgYvnorroqo1cblx0XHRjb25zdCBvdXRwdXRGb2xkZXIgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodGhpcy5zZXR0aW5ncy5vdXRwdXRGb2xkZXIpO1xuXHRcdGlmICghKG91dHB1dEZvbGRlciBpbnN0YW5jZW9mIFRGb2xkZXIpKSB7XG5cdFx0XHRuZXcgTm90aWNlKCdPdXRwdXQgZm9sZGVyIG5vdCBmb3VuZC4gUGxlYXNlIGNoZWNrIHlvdXIgc2V0dGluZ3MuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44Gu5YaF5a6544KS5Y+W5b6XXG5cdFx0Y29uc3QgdGVtcGxhdGVDb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZCh0ZW1wbGF0ZUZpbGUpO1xuXG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44Gu5YaF5a6544KS572u5o+bXG5cdFx0bGV0IG5ld0NvbnRlbnQgPSB0ZW1wbGF0ZUNvbnRlbnQ7XG5cdFx0bmV3Q29udGVudCA9IG5ld0NvbnRlbnQucmVwbGFjZSgve3tib29rLWNyZWF0b3I6dGl0bGV9fS9nLCBib29rSW5mby50aXRsZSk7XG5cdFx0bmV3Q29udGVudCA9IG5ld0NvbnRlbnQucmVwbGFjZSgve3tib29rLWNyZWF0b3I6YXV0aG9yfX0vZywgYm9va0luZm8uYXV0aG9yKTtcblx0XHRuZXdDb250ZW50ID0gbmV3Q29udGVudC5yZXBsYWNlKC97e2Jvb2stY3JlYXRvcjpnZW5yZX19L2csIGJvb2tJbmZvLmdlbnJlKTtcblx0XHRuZXdDb250ZW50ID0gbmV3Q29udGVudC5yZXBsYWNlKC97e2Jvb2stY3JlYXRvcjpzdW1tYXJ5fX0vZywgYm9va0luZm8uc3VtbWFyeSk7XG5cdFx0Ly8gQW1hem9uIFVSTOOCkk1hcmtkb3du44Oq44Oz44Kv44Go44GX44Gm5oy/5YWlXG5cdFx0bmV3Q29udGVudCA9IG5ld0NvbnRlbnQucmVwbGFjZSgve3tib29rLWNyZWF0b3I6YW1hem9uLWxpbmt9fS9nLCB0aGlzLmNyZWF0ZU1hcmtkb3duTGluayhib29rSW5mby50aXRsZSwgYm9va0luZm8uYW1hem9uVXJsKSk7XG5cblx0XHQvLyDjg5XjgqHjgqTjg6vlkI3vvIjjgr/jgqTjg4jjg6vjgYvjgonkuI3mraPjgarmloflrZfjgpLpmaTljrvvvIlcblx0XHRjb25zdCBmaWxlTmFtZSA9IGAke2Jvb2tJbmZvLnRpdGxlLnJlcGxhY2UoL1tcXFxcLzoqP1wiPD58XS9nLCAnJyl9Lm1kYDtcblx0XHRjb25zdCBmaWxlUGF0aCA9IGAke3RoaXMuc2V0dGluZ3Mub3V0cHV0Rm9sZGVyfS8ke2ZpbGVOYW1lfWA7XG5cblx0XHQvLyDmlrDjgZfjgYTjg47jg7zjg4jjgpLkvZzmiJBcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKGZpbGVQYXRoLCBuZXdDb250ZW50KTtcblx0XHRcdG5ldyBOb3RpY2UoYEJvb2sgY2FyZCBjcmVhdGVkOiAke2ZpbGVOYW1lfWApO1xuXHRcdFx0XG5cdFx0XHQvLyDkvZzmiJDjgZfjgZ/jg47jg7zjg4jjgpLplovjgY9cblx0XHRcdGNvbnN0IG5ld0ZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZmlsZVBhdGgpO1xuXHRcdFx0aWYgKG5ld0ZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuXHRcdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZigpLm9wZW5GaWxlKG5ld0ZpbGUpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRuZXcgTm90aWNlKGBFcnJvciBjcmVhdGluZyBub3RlOiAke2Vycm9yfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZldGNoQm9va0luZm8oYW1hem9uVXJsOiBzdHJpbmcpOiBQcm9taXNlPEJvb2tJbmZvPiB7XG5cdFx0Ly8gVVJM44Gu44OQ44Oq44OH44O844K344On44OzXG5cdFx0aWYgKCFhbWF6b25VcmwuaW5jbHVkZXMoJ2FtYXpvbicpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgQW1hem9uIFVSTCcpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBDT1JT44Gu5ZWP6aGM44KS5Zue6YG/44GZ44KL44Gf44KB44Gr44OX44Ot44Kt44K344K144O844OT44K544KS5L2/55SoXG5cdFx0XHQvLyDopIfmlbDjga7jg5fjg63jgq3jgrfjgqrjg5fjgrfjg6fjg7PjgpLnlKjmhI9cblx0XHRcdGNvbnN0IHByb3h5VXJscyA9IFtcblx0XHRcdFx0YGh0dHBzOi8vYXBpLmFsbG9yaWdpbnMud2luL2dldD91cmw9JHtlbmNvZGVVUklDb21wb25lbnQoYW1hem9uVXJsKX1gLFxuXHRcdFx0XHRgaHR0cHM6Ly9jb3JzcHJveHkuaW8vPyR7ZW5jb2RlVVJJQ29tcG9uZW50KGFtYXpvblVybCl9YCxcblx0XHRcdFx0YGh0dHBzOi8vY29ycy1hbnl3aGVyZS5oZXJva3VhcHAuY29tLyR7YW1hem9uVXJsfWBcblx0XHRcdF07XG5cdFx0XHRcblx0XHRcdGxldCBodG1sQ29udGVudCA9ICcnO1xuXHRcdFx0bGV0IHByb3h5RXJyb3IgPSAnJztcblx0XHRcdFxuXHRcdFx0Ly8g44OX44Ot44Kt44K344KS6aCG55Wq44Gr6Kmm44GZXG5cdFx0XHRmb3IgKGNvbnN0IHByb3h5VXJsIG9mIHByb3h5VXJscykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocHJveHlVcmwpO1xuXHRcdFx0XHRcdFxuXHRcdFx0XHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdFx0XHRcdHByb3h5RXJyb3IgPSBgRmFpbGVkIHRvIGZldGNoIGRhdGE6ICR7cmVzcG9uc2Uuc3RhdHVzfWA7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0Ly8g44Os44K544Od44Oz44K544K/44Kk44OX44KS56K66KqNXG5cdFx0XHRcdFx0Y29uc3QgY29udGVudFR5cGUgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJyk7XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0aWYgKGNvbnRlbnRUeXBlICYmIGNvbnRlbnRUeXBlLmluY2x1ZGVzKCdhcHBsaWNhdGlvbi9qc29uJykpIHtcblx0XHRcdFx0XHRcdC8vIEpTT07jg6zjgrnjg53jg7Pjgrnjga7loLTlkIhcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlRGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblx0XHRcdFx0XHRcdGlmIChyZXNwb25zZURhdGEuY29udGVudHMpIHtcblx0XHRcdFx0XHRcdFx0Ly8gYWxsb3JpZ2luc+W9ouW8j+OBruODrOOCueODneODs+OCuVxuXHRcdFx0XHRcdFx0XHRodG1sQ29udGVudCA9IHJlc3BvbnNlRGF0YS5jb250ZW50cztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8g44OG44Kt44K544OIL0hUTUzjg6zjgrnjg53jg7Pjgrnjga7loLTlkIhcblx0XHRcdFx0XHRcdGh0bWxDb250ZW50ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcblx0XHRcdFx0XHQvLyDmiJDlip/jgZfjgZ/jgonjg6vjg7zjg5fjgpLmipzjgZHjgotcblx0XHRcdFx0XHRpZiAoaHRtbENvbnRlbnQpIGJyZWFrO1xuXHRcdFx0XHRcdFxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRwcm94eUVycm9yID0gYFByb3h5IGVycm9yOiAke2Vyci5tZXNzYWdlfWA7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0aWYgKCFodG1sQ29udGVudCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBBbWF6b24gZGF0YTogJHtwcm94eUVycm9yfWApO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHQvLyBIVE1M44GL44KJ44Oh44K/44OH44O844K/44KS5oq95Ye6XG5cdFx0XHRjb25zdCB0aXRsZU1hdGNoID0gaHRtbENvbnRlbnQubWF0Y2goLzxzcGFuIGlkPVwicHJvZHVjdFRpdGxlXCJbXj5dKj4oW148XSspPFxcL3NwYW4+Lyk7XG5cdFx0XHRjb25zdCBhdXRob3JNYXRjaCA9IGh0bWxDb250ZW50Lm1hdGNoKC88YSBjbGFzcz1cIlteXCJdKlwiIGhyZWY9XCJbXlwiXSpcXC9lXFwvW15cIl0qXCI+KFtePF0rKTxcXC9hPi8pIHx8IFxuXHRcdFx0XHRodG1sQ29udGVudC5tYXRjaCgvaWQ9XCJieWxpbmVJbmZvXCJbXj5dKj5bXFxzXFxTXSo/PHNwYW5bXj5dKj4oW148XSspPFxcL3NwYW4+Lyk7XG5cdFx0XHRcblx0XHRcdC8vIOWVhuWTgeiqrOaYjuOCkuWPluW+lyAo6KSH5pWw44Gu44OR44K/44O844Oz44Gr5a++5b+cKVxuXHRcdFx0Y29uc3Qgc3VtbWFyeU1hdGNoID0gaHRtbENvbnRlbnQubWF0Y2goLzxkaXYgaWQ9XCJib29rRGVzY3JpcHRpb25fZmVhdHVyZV9kaXZcIltePl0qPihbXFxzXFxTXSo/KTxcXC9kaXY+LykgfHwgXG5cdFx0XHRcdGh0bWxDb250ZW50Lm1hdGNoKC88ZGl2IGlkPVwicHJvZHVjdERlc2NyaXB0aW9uXCJbXj5dKj4oW1xcc1xcU10qPyk8XFwvZGl2Pi8pO1xuXHRcdFx0XG5cdFx0XHQvLyDjgrjjg6Pjg7Pjg6vmg4XloLHjgpLlj5blvpfvvIjjgqvjg4bjgrTjg6rjgYvjgonmjqjmuKzvvIlcblx0XHRcdGNvbnN0IGdlbnJlTWF0Y2ggPSBodG1sQ29udGVudC5tYXRjaCgvPGEgY2xhc3M9XCJhLWxpbmstbm9ybWFsIGEtY29sb3ItdGVydGlhcnlcIltePl0qPihbXjxdKyk8XFwvYT4vKSB8fCBcblx0XHRcdFx0aHRtbENvbnRlbnQubWF0Y2goL2lkPVwid2F5ZmluZGluZy1icmVhZGNydW1ic19mZWF0dXJlX2RpdlwiW14+XSo+W1xcc1xcU10qPzxhW14+XSo+KFtePF0rKTxcXC9hPi8pO1xuXHRcdFx0XG5cdFx0XHQvLyDjg4fjg7zjgr/jgpLmlbTlvaLjgZfjgabov5TjgZlcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRpdGxlOiB0aXRsZU1hdGNoID8gdGl0bGVNYXRjaFsxXS50cmltKCkgOiAnVW5rbm93biBUaXRsZScsXG5cdFx0XHRcdGF1dGhvcjogYXV0aG9yTWF0Y2ggPyBhdXRob3JNYXRjaFsxXS50cmltKCkgOiAnVW5rbm93biBBdXRob3InLFxuXHRcdFx0XHRnZW5yZTogZ2VucmVNYXRjaCA/IGdlbnJlTWF0Y2hbMV0udHJpbSgpIDogJ0ZpY3Rpb24nLFxuXHRcdFx0XHRzdW1tYXJ5OiBzdW1tYXJ5TWF0Y2ggPyB0aGlzLmNsZWFuSHRtbChzdW1tYXJ5TWF0Y2hbMV0pLnRyaW0oKSA6ICdObyBzdW1tYXJ5IGF2YWlsYWJsZS4nLFxuXHRcdFx0XHRhbWF6b25Vcmw6IGFtYXpvblVybCAvLyBBbWF6b24gVVJM44KS5L+d5a2YXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciBmZXRjaGluZyBib29rIGluZm9ybWF0aW9uOicsIGVycm9yKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGZldGNoIGJvb2sgaW5mb3JtYXRpb24uIFBsZWFzZSBjaGVjayB0aGUgVVJMIGFuZCB0cnkgYWdhaW4uJyk7XG5cdFx0fVxuXHR9XG5cdFxuXHQvLyBIVE1M44K/44Kw44KS6Zmk5Y6744GZ44KL44OY44Or44OR44O844Oh44K944OD44OJXG5cdHByaXZhdGUgY2xlYW5IdG1sKGh0bWw6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGh0bWwucmVwbGFjZSgvPFtePl0qPi9nLCAnICcpLnJlcGxhY2UoL1xcc3syLH0vZywgJyAnKTtcblx0fVxuXHRcblx0Ly8gT2JzaWRpYW7jga7jgr/jgrDjgoTjg6rjg7Pjgq/jgavlubLmuInjgZnjgovmloflrZfjgpLpmaTljrvjgZfjgIFNYXJrZG93buODquODs+OCr+OCkuS9nOaIkFxuXHRwcml2YXRlIGNyZWF0ZU1hcmtkb3duTGluayh0aXRsZTogc3RyaW5nLCB1cmw6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Ly8gT2JzaWRpYW7jga7jgr/jgrDjgoTjg6rjg7Pjgq/jgavkvb/jgo/jgozjgovnibnmrormloflrZfjgpLpmaTljrtcblx0XHRjb25zdCBjbGVhblRpdGxlID0gdGl0bGUucmVwbGFjZSgvWyNcXFtcXF18XS9nLCAnJykudHJpbSgpO1xuXHRcdC8vIE1hcmtkb3du5b2i5byP44Gu44Oq44Oz44Kv44KS5L2c5oiQXG5cdFx0cmV0dXJuIGBbJHtjbGVhblRpdGxlfV0oJHt1cmx9KWA7XG5cdH1cbn1cblxuaW50ZXJmYWNlIEJvb2tJbmZvIHtcblx0dGl0bGU6IHN0cmluZztcblx0YXV0aG9yOiBzdHJpbmc7XG5cdGdlbnJlOiBzdHJpbmc7XG5cdHN1bW1hcnk6IHN0cmluZztcblx0YW1hem9uVXJsOiBzdHJpbmc7XG59XG5cbmNsYXNzIEJvb2tVcmxNb2RhbCBleHRlbmRzIE1vZGFsIHtcblx0cGx1Z2luOiBCb29rQ2FyZENyZWF0b3I7XG5cdHVybDogc3RyaW5nID0gJyc7XG5cblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogQm9va0NhcmRDcmVhdG9yKSB7XG5cdFx0c3VwZXIoYXBwKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcblx0fVxuXG5cdG9uT3BlbigpIHtcblx0XHRjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcblx0XHRjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnRW50ZXIgQW1hem9uIEJvb2sgVVJMJyB9KTtcblxuXHRcdC8vIFVSTOWFpeWKm+ODleOCo+ODvOODq+ODiVxuXHRcdGNvbnN0IHVybElucHV0Q29udGFpbmVyID0gY29udGVudEVsLmNyZWF0ZURpdigpO1xuXHRcdGNvbnN0IHVybElucHV0ID0gdXJsSW5wdXRDb250YWluZXIuY3JlYXRlRWwoJ2lucHV0Jywge1xuXHRcdFx0YXR0cjoge1xuXHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdHBsYWNlaG9sZGVyOiAnaHR0cHM6Ly93d3cuYW1hem9uLmNvbS8uLi4nXG5cdFx0XHR9LFxuXHRcdFx0Y2xzOiAnYm9vay11cmwtaW5wdXQnXG5cdFx0fSk7XG5cdFx0dXJsSW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0dXJsSW5wdXQuc3R5bGUubWFyZ2luQm90dG9tID0gJzFlbSc7XG5cdFx0dXJsSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCAoZSkgPT4ge1xuXHRcdFx0dGhpcy51cmwgPSAoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG5cdFx0fSk7XG5cblx0XHQvLyDjg5zjgr/jg7PjgrPjg7Pjg4bjg4pcblx0XHRjb25zdCBidXR0b25Db250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KCk7XG5cdFx0YnV0dG9uQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0YnV0dG9uQ29udGFpbmVyLnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ2ZsZXgtZW5kJztcblx0XHRidXR0b25Db250YWluZXIuc3R5bGUuZ2FwID0gJzAuNWVtJztcblxuXHRcdC8vIOOCreODo+ODs+OCu+ODq+ODnOOCv+ODs1xuXHRcdGNvbnN0IGNhbmNlbEJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ2FuY2VsJyB9KTtcblx0XHRjYW5jZWxCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLmNsb3NlKCkpO1xuXG5cdFx0Ly8g5L2c5oiQ44Oc44K/44OzXG5cdFx0Y29uc3QgY3JlYXRlQnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdDcmVhdGUnLCBjbHM6ICdtb2QtY3RhJyB9KTtcblx0XHRjcmVhdGVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMudXJsKSB7XG5cdFx0XHRcdG5ldyBOb3RpY2UoJ1BsZWFzZSBlbnRlciBhIHZhbGlkIEFtYXpvbiBVUkwnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRuZXcgTm90aWNlKCdGZXRjaGluZyBib29rIGluZm9ybWF0aW9uLi4uJyk7XG5cdFx0XHRcdGNvbnN0IGJvb2tJbmZvID0gYXdhaXQgdGhpcy5wbHVnaW4uZmV0Y2hCb29rSW5mbyh0aGlzLnVybCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLmNyZWF0ZU5vdGVGcm9tVGVtcGxhdGUoYm9va0luZm8pO1xuXHRcdFx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRuZXcgTm90aWNlKGBFcnJvcjogJHtlcnJvcn1gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIOWFpeWKm+ODleOCo+ODvOODq+ODieOBq+ODleOCqeODvOOCq+OCuVxuXHRcdHVybElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHRvbkNsb3NlKCkge1xuXHRcdGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuXHRcdGNvbnRlbnRFbC5lbXB0eSgpO1xuXHR9XG59XG5cbmNsYXNzIEJvb2tDYXJkQ3JlYXRvclNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcblx0cGx1Z2luOiBCb29rQ2FyZENyZWF0b3I7XG5cblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogQm9va0NhcmRDcmVhdG9yKSB7XG5cdFx0c3VwZXIoYXBwLCBwbHVnaW4pO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0ZGlzcGxheSgpOiB2b2lkIHtcblx0XHRjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuXHRcdGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cblx0XHRjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdCb29rIENhcmQgQ3JlYXRvciBTZXR0aW5ncycgfSk7XG5cblx0XHQvLyDjg4bjg7Pjg5fjg6zjg7zjg4jjg5XjgqHjgqTjg6vjga7oqK3lrppcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKCdUZW1wbGF0ZSBmaWxlJylcblx0XHRcdC5zZXREZXNjKCdTZWxlY3QgdGhlIHRlbXBsYXRlIGZpbGUgZm9yIGJvb2sgY2FyZHMnKVxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcignRXhhbXBsZTogdGVtcGxhdGVzL2Jvb2stdGVtcGxhdGUubWQnKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGxhdGVQYXRoKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGxhdGVQYXRoID0gdmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpXG5cdFx0XHQuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cblx0XHRcdFx0LnNldEJ1dHRvblRleHQoJ0Jyb3dzZScpXG5cdFx0XHRcdC5vbkNsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHQvLyDml6LlrZjjga7jg5XjgqHjgqTjg6vjgpLpgbjmip7jgZnjgovjgZ/jgoHjga7mlrDjgZfjgYTjg6Ljg7zjg4Djg6vjgpLkvZzmiJBcblx0XHRcdFx0XHRuZXcgRmlsZVNlbGVjdG9yTW9kYWwodGhpcy5hcHAsIChmaWxlKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy50ZW1wbGF0ZVBhdGggPSBmaWxlLnBhdGg7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHRcdHRoaXMuZGlzcGxheSgpOyAvLyDoqK3lrprnlLvpnaLjgpLmm7TmlrBcblx0XHRcdFx0XHR9KS5vcGVuKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXG5cdFx0Ly8g5Ye65Yqb44OV44Kp44Or44OA44Gu6Kit5a6aXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZSgnT3V0cHV0IGZvbGRlcicpXG5cdFx0XHQuc2V0RGVzYygnU2VsZWN0IHRoZSBmb2xkZXIgd2hlcmUgYm9vayBjYXJkcyB3aWxsIGJlIGNyZWF0ZWQnKVxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcignRXhhbXBsZTogQm9va3MnKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mub3V0cHV0Rm9sZGVyKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Mub3V0cHV0Rm9sZGVyID0gdmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpXG5cdFx0XHQuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cblx0XHRcdFx0LnNldEJ1dHRvblRleHQoJ0Jyb3dzZScpXG5cdFx0XHRcdC5vbkNsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHQvLyDjg5Xjgqnjg6vjg4DjgpLpgbjmip7jgZnjgovjgZ/jgoHjga7mlrDjgZfjgYTjg6Ljg7zjg4Djg6vjgpLkvZzmiJBcblx0XHRcdFx0XHRuZXcgRm9sZGVyU2VsZWN0b3JNb2RhbCh0aGlzLmFwcCwgKGZvbGRlcikgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Mub3V0cHV0Rm9sZGVyID0gZm9sZGVyLnBhdGg7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHRcdHRoaXMuZGlzcGxheSgpOyAvLyDoqK3lrprnlLvpnaLjgpLmm7TmlrBcblx0XHRcdFx0XHR9KS5vcGVuKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXG5cdFx0Ly8g44OG44Oz44OX44Os44O844OI44Gu5L2/44GE5pa544Gu6Kqs5piOXG5cdFx0Y29udGFpbmVyRWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnVGVtcGxhdGUgVmFyaWFibGVzJyB9KTtcblx0XHRjb25zdCB0ZW1wbGF0ZUluZm8gPSBjb250YWluZXJFbC5jcmVhdGVFbCgnZGl2Jyk7XG5cdFx0dGVtcGxhdGVJbmZvLmlubmVySFRNTCA9IGBcblx0XHRcdDxwPllvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgdmFyaWFibGVzIGluIHlvdXIgdGVtcGxhdGU6PC9wPlxuXHRcdFx0PHVsPlxuXHRcdFx0XHQ8bGk+PGNvZGU+e3tib29rLWNyZWF0b3I6dGl0bGV9fTwvY29kZT4gLSBCb29rIHRpdGxlPC9saT5cblx0XHRcdFx0PGxpPjxjb2RlPnt7Ym9vay1jcmVhdG9yOmF1dGhvcn19PC9jb2RlPiAtIEJvb2sgYXV0aG9yPC9saT5cblx0XHRcdFx0PGxpPjxjb2RlPnt7Ym9vay1jcmVhdG9yOmdlbnJlfX08L2NvZGU+IC0gQm9vayBnZW5yZTwvbGk+XG5cdFx0XHRcdDxsaT48Y29kZT57e2Jvb2stY3JlYXRvcjpzdW1tYXJ5fX08L2NvZGU+IC0gQm9vayBzdW1tYXJ5PC9saT5cblx0XHRcdFx0PGxpPjxjb2RlPnt7Ym9vay1jcmVhdG9yOmFtYXpvbi1saW5rfX08L2NvZGU+IC0gTWFya2Rvd24gbGluayB0byBBbWF6b24gcGFnZTwvbGk+XG5cdFx0XHQ8L3VsPlxuXHRcdGA7XG5cdH1cbn1cblxuLy8g44OV44Kh44Kk44Or6YG45oqe55So44Gu44Oi44O844OA44OrXG5jbGFzcyBGaWxlU2VsZWN0b3JNb2RhbCBleHRlbmRzIE1vZGFsIHtcblx0b25TZWxlY3Q6IChmaWxlOiBURmlsZSkgPT4gdm9pZDtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgb25TZWxlY3Q6IChmaWxlOiBURmlsZSkgPT4gdm9pZCkge1xuXHRcdHN1cGVyKGFwcCk7XG5cdFx0dGhpcy5vblNlbGVjdCA9IG9uU2VsZWN0O1xuXHR9XG5cblx0b25PcGVuKCkge1xuXHRcdGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuXHRcdGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdTZWxlY3QgVGVtcGxhdGUgRmlsZScgfSk7XG5cblx0XHRjb25zdCBmaWxlTGlzdCA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoKTtcblx0XHRmaWxlTGlzdC5zdHlsZS5tYXhIZWlnaHQgPSAnNDAwcHgnO1xuXHRcdGZpbGVMaXN0LnN0eWxlLm92ZXJmbG93ID0gJ2F1dG8nO1xuXG5cdFx0Ly8g44Oe44O844Kv44OA44Km44Oz44OV44Kh44Kk44Or44Gu5LiA6Kan44KS6KGo56S6XG5cdFx0dGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpLmZvckVhY2goZmlsZSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlSXRlbSA9IGZpbGVMaXN0LmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2ZpbGUtaXRlbScgfSk7XG5cdFx0XHRmaWxlSXRlbS5zdHlsZS5wYWRkaW5nID0gJzVweCc7XG5cdFx0XHRmaWxlSXRlbS5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cdFx0XHRmaWxlSXRlbS5zdHlsZS5ib3JkZXJCb3R0b20gPSAnMXB4IHNvbGlkIHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyKSc7XG5cdFx0XHRmaWxlSXRlbS5pbm5lckhUTUwgPSBgPHNwYW4+JHtmaWxlLnBhdGh9PC9zcGFuPmA7XG5cdFx0XHRcblx0XHRcdGZpbGVJdGVtLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uU2VsZWN0KGZpbGUpO1xuXHRcdFx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0ZmlsZUl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcblx0XHRcdFx0ZmlsZUl0ZW0uc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3ZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItaG92ZXIpJztcblx0XHRcdH0pO1xuXG5cdFx0XHRmaWxlSXRlbS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4ge1xuXHRcdFx0XHRmaWxlSXRlbS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAnJztcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0b25DbG9zZSgpIHtcblx0XHRjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcblx0XHRjb250ZW50RWwuZW1wdHkoKTtcblx0fVxufVxuXG4vLyDjg5Xjgqnjg6vjg4Dpgbjmip7nlKjjga7jg6Ljg7zjg4Djg6tcbmNsYXNzIEZvbGRlclNlbGVjdG9yTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG5cdG9uU2VsZWN0OiAoZm9sZGVyOiBURm9sZGVyKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBvblNlbGVjdDogKGZvbGRlcjogVEZvbGRlcikgPT4gdm9pZCkge1xuXHRcdHN1cGVyKGFwcCk7XG5cdFx0dGhpcy5vblNlbGVjdCA9IG9uU2VsZWN0O1xuXHR9XG5cblx0b25PcGVuKCkge1xuXHRcdGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuXHRcdGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdTZWxlY3QgT3V0cHV0IEZvbGRlcicgfSk7XG5cblx0XHRjb25zdCBmb2xkZXJMaXN0ID0gY29udGVudEVsLmNyZWF0ZURpdigpO1xuXHRcdGZvbGRlckxpc3Quc3R5bGUubWF4SGVpZ2h0ID0gJzQwMHB4Jztcblx0XHRmb2xkZXJMaXN0LnN0eWxlLm92ZXJmbG93ID0gJ2F1dG8nO1xuXG5cdFx0Ly8g44OV44Kp44Or44OA44Gu5LiA6Kan44KS5Y+W5b6X44GX44Gm6KGo56S6XG5cdFx0Y29uc3QgZm9sZGVyczogVEZvbGRlcltdID0gW107XG5cdFx0dGhpcy5nZXRBbGxGb2xkZXJzKHRoaXMuYXBwLnZhdWx0LmdldFJvb3QoKSwgZm9sZGVycyk7XG5cblx0XHRmb2xkZXJzLmZvckVhY2goZm9sZGVyID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlckl0ZW0gPSBmb2xkZXJMaXN0LmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2ZvbGRlci1pdGVtJyB9KTtcblx0XHRcdGZvbGRlckl0ZW0uc3R5bGUucGFkZGluZyA9ICc1cHgnO1xuXHRcdFx0Zm9sZGVySXRlbS5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cdFx0XHRmb2xkZXJJdGVtLnN0eWxlLmJvcmRlckJvdHRvbSA9ICcxcHggc29saWQgdmFyKC0tYmFja2dyb3VuZC1tb2RpZmllci1ib3JkZXIpJztcblx0XHRcdGZvbGRlckl0ZW0uaW5uZXJIVE1MID0gYDxzcGFuPiR7Zm9sZGVyLnBhdGggfHwgJy8nfTwvc3Bhbj5gO1xuXHRcdFx0XG5cdFx0XHRmb2xkZXJJdGVtLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uU2VsZWN0KGZvbGRlcik7XG5cdFx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRmb2xkZXJJdGVtLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XG5cdFx0XHRcdGZvbGRlckl0ZW0uc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3ZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItaG92ZXIpJztcblx0XHRcdH0pO1xuXG5cdFx0XHRmb2xkZXJJdGVtLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG5cdFx0XHRcdGZvbGRlckl0ZW0uc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJyc7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIOODleOCqeODq+ODgOOCkuWGjeW4sOeahOOBq+WPluW+l1xuXHRnZXRBbGxGb2xkZXJzKGZvbGRlcjogVEZvbGRlciwgZm9sZGVyczogVEZvbGRlcltdKSB7XG5cdFx0Zm9sZGVycy5wdXNoKGZvbGRlcik7XG5cdFx0XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBmb2xkZXIuY2hpbGRyZW4pIHtcblx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcblx0XHRcdFx0dGhpcy5nZXRBbGxGb2xkZXJzKGNoaWxkLCBmb2xkZXJzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvbkNsb3NlKCkge1xuXHRcdGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuXHRcdGNvbnRlbnRFbC5lbXB0eSgpO1xuXHR9XG59Il19