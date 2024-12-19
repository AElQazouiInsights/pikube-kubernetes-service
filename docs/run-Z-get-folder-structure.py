import os
import yaml
from pathlib import Path


# Load the conf_base.yml configuration file
def load_config(config_path):
    with open(config_path, "r", encoding="utf-8") as file:
        return yaml.safe_load(file)


# Function to generate the directory tree structure and write it to a file
def generate_tree(dir_path, file, exclude_folders=None, prefix="", is_last=True):
    if exclude_folders is None:
        exclude_folders = []

    # Print the name of the current directory or file
    connector = "└── " if is_last else "├── "
    file.write(prefix + connector + os.path.basename(dir_path) + "/\n")

    # List the contents of the directory
    files = sorted(os.listdir(dir_path))
    # Separate directories and files, excluding folders in `exclude_folders`
    dirs = [f for f in files if os.path.isdir(os.path.join(dir_path, f)) and f not in exclude_folders]
    non_dirs = [f for f in files if not os.path.isdir(os.path.join(dir_path, f))]

    # Create a new prefix for the sub-items
    new_prefix = prefix + ("    " if is_last else "│   ")

    # Recursively print directories
    for index, folder in enumerate(dirs):
        is_last_dir = index == len(dirs) - 1 and not non_dirs
        generate_tree(
            os.path.join(dir_path, folder),
            file,
            exclude_folders,
            new_prefix,
            is_last_dir,
        )

    # Print files in the current directory
    for index, file_name in enumerate(non_dirs):
        is_last_file = index == len(non_dirs) - 1
        connector = "└── " if is_last_file else "├── "
        file.write(new_prefix + connector + file_name + "\n")


# Load the configuration from conf_base.yml
base_config_path = (
    "C:/Users/User/bin/github/pikube-kubernetes-service/docs/conf_base.yml"  # Initial hardcoded path
)
config = load_config(base_config_path)

# Retrieve f_config from the loaded config and use it to set the config file path
config_file_path = Path(config["f_config"]) / "conf_base.yml"

# Now load the configuration using f_config
config = load_config(config_file_path)

# Use f_root as the directory to generate the tree structure
root_directory = config["f_root"]

# Set the output file path (to save the tree structure)
output_file_path = Path(config["f_config"]) / "tree_structure.txt"

# Create the config directory if it doesn't exist
output_file_path.parent.mkdir(parents=True, exist_ok=True)

# Specify folders to exclude (e.g., __pycache__)
exclude_folders = ["__pycache__", ".ruff_cache", ".git", ".vscode", "pi-cluster", "package-lock.json", "package.json", "node_modules"]

# Generate the tree structure and save it to the file with UTF-8 encoding
with open(output_file_path, "w", encoding="utf-8") as file:
    generate_tree(root_directory, file, exclude_folders=exclude_folders)

print(f"Directory tree saved to {output_file_path}")
