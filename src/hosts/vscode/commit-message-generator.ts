import { buildApiHandler } from "@core/api"
import * as path from "path"
import * as vscode from "vscode"
import { Controller } from "@/core/controller"
import { HostProvider } from "@/hosts/host-provider"
import { ShowMessageType } from "@/shared/proto/host/window"
import { Logger } from "@/shared/services/Logger"
import { getGitDiff } from "@/utils/git"

/**
 * Git commit message generator module
 */

/**
 * Gets git diff prioritizing staged changes. If staged changes exist, returns only those.
 * Falls back to all changes when nothing is staged.
 */
export async function getGitDiffStagedFirst(cwd: string): Promise<string> {
	try {
		return await getGitDiff(cwd, true)
	} catch {
		return await getGitDiff(cwd, false)
	}
}

let commitGenerationAbortController: AbortController | undefined

const PROMPT: {
	system: string
	user: string
	instruction: string
	languageInstructions: Record<string, string>
} = {
	system: "You are a helpful assistant that generates informative git commit messages based on git diffs output. Skip preamble and remove all backticks surrounding the commit message.",
	user: "Notes from developer (ignore if not relevant): {{USER_CURRENT_INPUT}}",
	instruction: `Based on the provided git diff, generate a concise and descriptive commit message.

The commit message should:
1. Has a short title (50-72 characters)
2. The commit message should adhere to the conventional commit format
3. Describe what was changed and why
4. Be clear and informative

IMPORTANT: Generate the commit message in the same language as the user's preferred language setting ({{USER_LANGUAGE}}). If the preferred language is Chinese (zh-CN or zh-TW), generate the commit message in Chinese. Otherwise, generate it in English.`,
	languageInstructions: {
		"zh-CN": "请用简体中文生成提交消息。",
		"zh-TW": "請用繁體中文生成提交訊息。",
	},
}

export async function generateCommitMsg(controller: Controller, scm?: vscode.SourceControl) {
	try {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports
		if (!gitExtension) {
			throw new Error("Git extension not found")
		}

		const git = gitExtension.getAPI(1)
		if (git.repositories.length === 0) {
			throw new Error("No Git repositories available")
		}

		// If scm is provided, then the user specified one repository by clicking the "Source Control" menu button
		if (scm) {
			const repository = git.getRepository(scm.rootUri)

			if (!repository) {
				throw new Error("Repository not found for provided SCM")
			}

			await generateCommitMsgForRepository(controller, repository)
			return
		}

		await orchestrateWorkspaceCommitMsgGeneration(controller, git.repositories)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: `[Commit Generation Failed] ${errorMessage}`,
		})
	}
}

async function orchestrateWorkspaceCommitMsgGeneration(controller: Controller, repos: any[]) {
	const reposWithChanges = await filterForReposWithChanges(repos)

	if (reposWithChanges.length === 0) {
		HostProvider.window.showMessage({
			type: ShowMessageType.INFORMATION,
			message: "No changes found in any workspace repositories",
		})
		return
	}

	if (reposWithChanges.length === 1) {
		// Only one repo with changes, generate for it
		const repo = reposWithChanges[0]
		await generateCommitMsgForRepository(controller, repo)
		return
	}

	const selection = await promptRepoSelection(reposWithChanges)

	if (!selection) {
		// User cancelled
		return
	}

	if (selection.repo === null) {
		// Generate for all repositories with changes
		for (const repo of reposWithChanges) {
			try {
				await generateCommitMsgForRepository(controller, repo)
			} catch (error) {
				Logger.error(`Failed to generate commit message for ${repo.rootUri.fsPath}:`, error)
			}
		}
	} else {
		// Generate for selected repository
		await generateCommitMsgForRepository(controller, selection.repo)
	}
}

async function filterForReposWithChanges(repos: any[]) {
	const reposWithChanges = []

	// Check which repositories have changes (prefer staged, fall back to all)
	for (const repo of repos) {
		try {
			const gitDiff = await getGitDiffStagedFirst(repo.rootUri.fsPath)
			if (gitDiff) {
				reposWithChanges.push(repo)
			}
		} catch {
			// Skip repositories with errors (no changes, etc.)
		}
	}
	return reposWithChanges
}

async function promptRepoSelection(repos: any[]) {
	// Multiple repos with changes - ask user to choose
	const repoItems = repos.map((repo) => ({
		label: repo.rootUri.fsPath.split(path.sep).pop() || repo.rootUri.fsPath,
		description: repo.rootUri.fsPath,
		repo: repo,
	}))

	repoItems.unshift({
		label: "$(git-commit) Generate for all repositories with changes",
		description: `Generate commit messages for ${repos.length} repositories`,
		repo: null as any,
	})

	return await vscode.window.showQuickPick(repoItems, {
		placeHolder: "Select repository for commit message generation",
	})
}

async function generateCommitMsgForRepository(controller: Controller, repository: any) {
	const inputBox = repository.inputBox
	const repoPath = repository.rootUri.fsPath
	const gitDiff = await getGitDiffStagedFirst(repoPath)

	if (!gitDiff) {
		throw new Error(`No changes in repository ${repoPath.split(path.sep).pop() || "repository"} for commit message`)
	}

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.SourceControl,
			title: `Generating commit message for ${repoPath.split(path.sep).pop() || "repository"}...`,
			cancellable: true,
		},
		() => performCommitMsgGeneration(controller, gitDiff, inputBox),
	)
}

async function performCommitMsgGeneration(controller: Controller, gitDiff: string, inputBox: any) {
	try {
		vscode.commands.executeCommand("setContext", "cline.isGeneratingCommit", true)

		const preferredLanguage = controller.stateManager.getGlobalSettingsKey("preferredLanguage") || "English"
		const languageKey = getLanguageKeyFromDisplay(preferredLanguage)
		const languageInstruction = PROMPT.languageInstructions[languageKey] || ""

		const prompts = [PROMPT.instruction.replace("{{USER_LANGUAGE}}", preferredLanguage)]

		const workspaceManager = await controller.ensureWorkspaceManager()
		if (workspaceManager) {
			const workspacesJson = await workspaceManager.buildWorkspacesJson()
			if (workspacesJson) {
				prompts.push(`# Workspace Configuration\n${workspacesJson}`)
			}
		}

		const currentInput = inputBox.value?.trim() || ""
		if (currentInput) {
			prompts.push(PROMPT.user.replace("{{USER_CURRENT_INPUT}}", currentInput))
		}

		if (languageInstruction) {
			prompts.push(languageInstruction)
		}

		const truncatedDiff = gitDiff.length > 5000 ? gitDiff.substring(0, 5000) + "\n\n[Diff truncated due to size]" : gitDiff
		prompts.push(truncatedDiff)

		const prompt = prompts.join("\n\n")

		// Get the current API configuration
		// Set to use Act mode for now by default
		const apiConfiguration = controller.stateManager.getApiConfiguration()
		const currentMode = "act"

		// Build the API handler
		const apiHandler = buildApiHandler(apiConfiguration, currentMode)

		// Create a system prompt
		const systemPrompt = PROMPT.system

		// Create a message for the API
		const messages = [{ role: "user" as const, content: prompt }]

		commitGenerationAbortController = new AbortController()
		const stream = apiHandler.createMessage(systemPrompt, messages)

		let response = ""
		for await (const chunk of stream) {
			commitGenerationAbortController.signal.throwIfAborted()
			if (chunk.type === "text") {
				response += chunk.text
				inputBox.value = extractCommitMessage(response)
			}
		}

		if (!inputBox.value) {
			throw new Error("empty API response")
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: `Failed to generate commit message: ${errorMessage}`,
		})
	} finally {
		vscode.commands.executeCommand("setContext", "cline.isGeneratingCommit", false)
	}
}

export function abortCommitGeneration() {
	commitGenerationAbortController?.abort()
	vscode.commands.executeCommand("setContext", "cline.isGeneratingCommit", false)
}

/**
 * Extracts the commit message from the AI response
 * @param str String containing the AI response
 * @returns The extracted commit message
 */
function extractCommitMessage(str: string): string {
	// Remove any markdown formatting or extra text
	return str
		.trim()
		.replace(/^```[^\n]*\n?|```$/g, "")
		.trim()
}

function getLanguageKeyFromDisplay(display: string): string {
	const languageMap: Record<string, string> = {
		English: "en",
		"Arabic - العربية": "ar",
		"Portuguese - Português (Brasil)": "pt-BR",
		"Czech - Čeština": "cs",
		"French - Français": "fr",
		"German - Deutsch": "de",
		"Hindi - हिन्दी": "hi",
		"Hungarian - Magyar": "hu",
		"Italian - Italiano": "it",
		"Japanese - 日本語": "ja",
		"Korean - 한국어": "ko",
		"Polish - Polski": "pl",
		"Portuguese - Português (Portugal)": "pt-PT",
		"Russian - Русский": "ru",
		"Simplified Chinese - 简体中文": "zh-CN",
		"Spanish - Español": "es",
		"Traditional Chinese - 繁體中文": "zh-TW",
		"Turkish - Türkçe": "tr",
	}
	return languageMap[display] || "en"
}
