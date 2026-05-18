#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace GameCLI.Bridge
{
    /// <summary>
    /// Apply files from .gamecli/staging/ (written by gamecli chat/gen) into the project.
    /// Menu: GameCLI → Apply Staging
    /// </summary>
    public static class GameCliBridge
    {
        const string StagingDir = ".gamecli/staging";
        const string ManifestFile = "manifest.json";

        [Serializable]
        class StagingManifest
        {
            public string id;
            public string createdAt;
            public List<StagedFile> files;
        }

        [Serializable]
        class StagedFile
        {
            public string path;
            public string action;
        }

        [MenuItem("GameCLI/Apply Staging")]
        public static void ApplyStaging()
        {
            var projectRoot = Directory.GetParent(Application.dataPath)?.FullName;
            if (projectRoot == null)
            {
                Debug.LogError("[gamecli-bridge] Cannot resolve project root.");
                return;
            }

            var stagingRoot = Path.Combine(projectRoot, StagingDir);
            var manifestPath = Path.Combine(stagingRoot, ManifestFile);
            if (!File.Exists(manifestPath))
            {
                EditorUtility.DisplayDialog(
                    "GameCLI",
                    "No staging found. Run gamecli chat or gen first.",
                    "OK");
                return;
            }

            var json = File.ReadAllText(manifestPath);
            var manifest = JsonUtility.FromJson<StagingManifest>(json);
            if (manifest?.files == null || manifest.files.Count == 0)
            {
                EditorUtility.DisplayDialog("GameCLI", "Staging manifest is empty.", "OK");
                return;
            }

            if (!EditorUtility.DisplayDialog(
                    "GameCLI Apply",
                    $"Apply {manifest.files.Count} staged file(s) to the project?",
                    "Apply",
                    "Cancel"))
            {
                return;
            }

            var applied = new List<string>();
            foreach (var entry in manifest.files)
            {
                var staged = Path.Combine(stagingRoot, "files", entry.path.Replace('/', Path.DirectorySeparatorChar));
                var target = Path.Combine(projectRoot, entry.path.Replace('/', Path.DirectorySeparatorChar));
                if (!File.Exists(staged))
                {
                    Debug.LogWarning($"[gamecli-bridge] Missing staged file: {entry.path}");
                    continue;
                }

                var dir = Path.GetDirectoryName(target);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    Directory.CreateDirectory(dir);

                File.Copy(staged, target, true);
                applied.Add(entry.path);
            }

            AssetDatabase.Refresh();
            EditorUtility.DisplayDialog(
                "GameCLI",
                $"Applied {applied.Count} file(s).\n\n" + string.Join("\n", applied),
                "OK");
            Debug.Log($"[gamecli-bridge] Applied {applied.Count} staged file(s).");
        }

        [MenuItem("GameCLI/Open Staging Folder")]
        public static void OpenStagingFolder()
        {
            var projectRoot = Directory.GetParent(Application.dataPath)?.FullName;
            if (projectRoot == null) return;
            var path = Path.Combine(projectRoot, StagingDir);
            if (!Directory.Exists(path)) Directory.CreateDirectory(path);
            EditorUtility.RevealInFinder(path);
        }
    }
}
#endif
