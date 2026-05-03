export type LanguageKey =
	| "en"
	| "ar"
	| "pt-BR"
	| "cs"
	| "fr"
	| "de"
	| "hi"
	| "hu"
	| "it"
	| "ja"
	| "ko"
	| "pl"
	| "pt-PT"
	| "ru"
	| "zh-CN"
	| "es"
	| "zh-TW"
	| "tr"

export type LanguageDisplay =
	| "English"
	| "Arabic - العربية"
	| "Portuguese - Português (Brasil)"
	| "Czech - Čeština"
	| "French - Français"
	| "German - Deutsch"
	| "Hindi - हिन्दी"
	| "Hungarian - Magyar"
	| "Italian - Italiano"
	| "Japanese - 日本語"
	| "Korean - 한국어"
	| "Polish - Polski"
	| "Portuguese - Português (Portugal)"
	| "Russian - Русский"
	| "Simplified Chinese - 简体中文"
	| "Spanish - Español"
	| "Traditional Chinese - 繁體中文"
	| "Turkish - Türkçe"

export const DEFAULT_LANGUAGE_SETTINGS: LanguageKey = "en"

export const languageOptions: { key: LanguageKey; display: LanguageDisplay }[] = [
	{ key: "en", display: "English" },
	{ key: "ar", display: "Arabic - العربية" },
	{ key: "pt-BR", display: "Portuguese - Português (Brasil)" },
	{ key: "cs", display: "Czech - Čeština" },
	{ key: "fr", display: "French - Français" },
	{ key: "de", display: "German - Deutsch" },
	{ key: "hi", display: "Hindi - हिन्दी" },
	{ key: "hu", display: "Hungarian - Magyar" },
	{ key: "it", display: "Italian - Italiano" },
	{ key: "ja", display: "Japanese - 日本語" },
	{ key: "ko", display: "Korean - 한국어" },
	{ key: "pl", display: "Polish - Polski" },
	{ key: "pt-PT", display: "Portuguese - Português (Portugal)" },
	{ key: "ru", display: "Russian - Русский" },
	{ key: "zh-CN", display: "Simplified Chinese - 简体中文" },
	{ key: "es", display: "Spanish - Español" },
	{ key: "zh-TW", display: "Traditional Chinese - 繁體中文" },
	{ key: "tr", display: "Turkish - Türkçe" },
]

export function getLanguageKey(display: LanguageDisplay | undefined): LanguageKey {
	if (!display) {
		return DEFAULT_LANGUAGE_SETTINGS
	}
	const languageOption = languageOptions.find((option) => option.display === display)
	if (languageOption) {
		return languageOption.key
	}
	return DEFAULT_LANGUAGE_SETTINGS
}

export function getPreferredLanguageInstructions(languageDisplay: string | undefined): string {
	if (!languageDisplay) {
		return ""
	}

	const languageInstructions: Record<string, string> = {
		"Simplified Chinese - 简体中文": "请使用简体中文回复",
		"Traditional Chinese - 繁體中文": "請使用繁體中文回覆",
		"Japanese - 日本語": "日本語で返信してください",
		"Korean - 한국어": "한국어로 답변해 주세요",
		"German - Deutsch": "Bitte auf Deutsch antworten",
		"French - Français": "Veuillez répondre en français",
		"Spanish - Español": "Por favor responda en español",
		"Russian - Русский": "Пожалуйста, ответьте на русском языке",
		"Arabic - العربية": "يرجى الرد بالعربية",
		"Hindi - हिन्दी": "कृपया हिंदी में उत्तर दें",
		"Italian - Italiano": "Per favore rispondi in italiano",
		"Portuguese - Português (Brasil)": "Por favor responda em português brasileiro",
		"Portuguese - Português (Portugal)": "Por favor responda em português",
		"Polish - Polski": "Proszę odpowiedzieć po polsku",
		"Czech - Čeština": "Odpovězte prosím v češtině",
		"Hungarian - Magyar": "Kérjük, magyarul válaszoljon",
		"Turkish - Türkçe": "Lütfen Türkçe cevap verin",
	}

	return languageInstructions[languageDisplay] || ""
}
