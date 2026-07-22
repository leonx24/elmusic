export class Command {
    name;
    description;
    options;
    constructor(options) {
        this.name = options.name;
        this.description = options.description;
        this.options = options.options || [];
    }
    async autocomplete(client, interaction) {
        return;
    }
}
