export class Command {
    name;
    description;
    aliases;
    options;
    constructor(options) {
        this.name = options.name;
        this.description = options.description;
        this.aliases = options.aliases || [];
        this.options = options.options || [];
    }
    async autocomplete(client, interaction) {
        return;
    }
}
